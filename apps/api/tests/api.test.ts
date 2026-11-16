import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import type { Event, PaginatedEvents, SeatsInfo } from '@app/shared';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/index.js';
import { sleep } from '../src/lib/delay.js';
import { EventService } from '../src/services/eventService.js';
import { EventStore } from '../src/services/eventStore.js';

const DATA_FILE = new URL('../data/events.json', import.meta.url);

interface TestContext {
  baseUrl: string;
  store: EventStore;
  close: () => Promise<void>;
}

async function startTestServer(overrides?: Partial<AppConfig>): Promise<TestContext> {
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    internalSecret: 'test-ssr-secret',
    rateLimit: { windowMs: 60_000, max: 60 },
    trustProxyHops: 0,
    corsOrigins: [],
    cache: { ttlMs: 60_000, maxEntries: 500 },
    db: { minDelayMs: 300, maxDelayMs: 400 },
    shutdownTimeoutMs: 5_000,
    ...overrides,
  };

  const store = new EventStore(config.db);
  await store.load(DATA_FILE);

  const eventService = new EventService(store, {
    max: config.cache.maxEntries,
    ttlMs: config.cache.ttlMs,
  });

  const app = createApp({ config, eventService });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    store,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('Afisha Server API', () => {
  let ctx: TestContext | undefined;

  afterEach(async () => {
    if (ctx) {
      await ctx.close();
      ctx = undefined;
    }
  });

  it('loads 60 events and coalesces 50 concurrent requests on a cold cache into 1 DB query', async () => {
    ctx = await startTestServer({ rateLimit: { windowMs: 60_000, max: 200 } });
    assert.equal(ctx.store.size, 60);
    assert.equal(ctx.store.queryCount, 0);

    const { baseUrl } = ctx;

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${baseUrl}/events?page=1&limit=10`)),
    );

    for (const res of responses) {
      assert.equal(res.status, 200);
    }

    assert.equal(ctx.store.queryCount, 1);

    const startWarm = performance.now();
    const warmRes = await fetch(`${baseUrl}/events?page=1&limit=10`);
    const elapsedWarm = performance.now() - startWarm;

    assert.equal(warmRes.status, 200);
    assert.equal(warmRes.headers.get('x-cache'), 'HIT');
    assert.ok(elapsedWarm < 100, `Expected warm cache hit < 100ms, got ${elapsedWarm.toFixed(1)}ms`);
    assert.equal(ctx.store.queryCount, 1);

    const body = (await warmRes.json()) as PaginatedEvents;
    assert.equal(body.data.length, 10);
    assert.equal(body.meta.total, 60);

    for (let i = 1; i < body.data.length; i++) {
      const prev = Date.parse(body.data[i - 1]!.date);
      const curr = Date.parse(body.data[i]!.date);
      assert.ok(prev <= curr, 'Events must be sorted by date ascending');
    }
  });

  it('invalidates GET /events/:id and GET /events cache when PATCH /events/:id succeeds', async () => {
    ctx = await startTestServer();
    const { baseUrl } = ctx;

    await fetch(`${baseUrl}/events/1`);
    await fetch(`${baseUrl}/events?page=1`);
    assert.equal(ctx.store.queryCount, 2);

    const patchRes = await fetch(`${baseUrl}/events/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Headline Event' }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as { data: Event };
    assert.equal(patched.data.title, 'Updated Headline Event');

    const afterItemRes = await fetch(`${baseUrl}/events/1`);
    assert.equal(afterItemRes.headers.get('x-cache'), 'MISS');
    const afterItem = (await afterItemRes.json()) as { data: Event };
    assert.equal(afterItem.data.title, 'Updated Headline Event');

    const afterListRes = await fetch(`${baseUrl}/events?q=Updated%20Headline`);
    assert.equal(afterListRes.headers.get('x-cache'), 'MISS');
    const afterList = (await afterListRes.json()) as PaginatedEvents;
    assert.equal(afterList.meta.total, 1);
    assert.equal(afterList.data[0]?.id, 1);
  });

  it('returns uncached random seats immediately without DB delay and 404 for unknown or non-numeric event IDs', async () => {
    ctx = await startTestServer();
    const { baseUrl } = ctx;

    const t0 = performance.now();
    const res = await fetch(`${baseUrl}/events/1/seats`);
    const elapsed = performance.now() - t0;

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(elapsed < 100, `Seats endpoint should not have DB delay, took ${elapsed.toFixed(1)}ms`);
    assert.equal(ctx.store.queryCount, 0);

    const body = (await res.json()) as { data: SeatsInfo };
    assert.equal(body.data.eventId, 1);
    assert.ok(body.data.availableSeats >= 0 && body.data.availableSeats <= body.data.capacity);

    const missingSeats = await fetch(`${baseUrl}/events/9999/seats`);
    assert.equal(missingSeats.status, 404);

    const missingEvent = await fetch(`${baseUrl}/events/9999`, { method: 'HEAD' });
    assert.equal(missingEvent.status, 404);

    const nonNumericEvent = await fetch(`${baseUrl}/events/abc`, { method: 'HEAD' });
    assert.equal(nonNumericEvent.status, 404);
  });

  it('tracks separate rate-limit buckets per x-client-ip when x-internal-secret is valid and counts cache hits', async () => {
    ctx = await startTestServer({
      internalSecret: 'my-ssr-secret',
      rateLimit: { windowMs: 1200, max: 2 },
    });
    const { baseUrl } = ctx;

    const ipAHeaders = {
      'x-internal-secret': 'my-ssr-secret',
      'x-client-ip': '203.0.113.10',
    };
    const ipBHeaders = {
      'x-internal-secret': 'my-ssr-secret',
      'x-client-ip': '203.0.113.20',
    };

    const a1 = await fetch(`${baseUrl}/cities`, { headers: ipAHeaders });
    assert.equal(a1.status, 200);
    assert.equal(a1.headers.get('x-cache'), 'MISS');

    const a2 = await fetch(`${baseUrl}/cities`, { headers: ipAHeaders });
    assert.equal(a2.status, 200);
    assert.equal(a2.headers.get('x-cache'), 'HIT');

    const a3 = await fetch(`${baseUrl}/cities`, { headers: ipAHeaders });
    assert.equal(a3.status, 429);
    assert.ok(Number(a3.headers.get('retry-after')) >= 1);

    const b1 = await fetch(`${baseUrl}/cities`, { headers: ipBHeaders });
    assert.equal(b1.status, 200);

    await sleep(1250);

    const aAfterReset = await fetch(`${baseUrl}/cities`, { headers: ipAHeaders });
    assert.equal(aAfterReset.status, 200);
  });

  it('ignores spoofed x-client-ip and X-Forwarded-For without valid secret and isolates internal requests', async () => {
    ctx = await startTestServer({
      internalSecret: 'my-ssr-secret',
      rateLimit: { windowMs: 60_000, max: 2 },
    });
    const { baseUrl } = ctx;

    const badPatch = await fetch(`${baseUrl}/events/1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'my-ssr-secret',
      },
      body: JSON.stringify({}),
    });
    assert.equal(badPatch.status, 400);

    for (let i = 0; i < 5; i++) {
      const internalRes = await fetch(`${baseUrl}/cities`, {
        headers: { 'x-internal-secret': 'my-ssr-secret' },
      });
      assert.equal(internalRes.status, 200);
    }

    const r1 = await fetch(`${baseUrl}/cities`, {
      headers: { 'x-client-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.1' },
    });
    const r2 = await fetch(`${baseUrl}/cities`, {
      headers: {
        'x-internal-secret': 'wrong-secret',
        'x-client-ip': '198.51.100.2',
        'x-forwarded-for': '198.51.100.2',
      },
    });
    const r3 = await fetch(`${baseUrl}/cities`, {
      headers: { 'x-client-ip': '198.51.100.3', 'x-forwarded-for': '198.51.100.3' },
    });

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
  });
});
