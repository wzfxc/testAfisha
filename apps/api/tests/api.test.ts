import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import type { Event, PaginatedEvents, SeatsInfo } from '@app/shared';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/index.js';
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
    rateLimit: { windowMs: 60_000, max: 100 },
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

    // Fire 50 identical requests simultaneously against a cold cache
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${baseUrl}/events?page=1&limit=10`)),
    );

    for (const res of responses) {
      assert.equal(res.status, 200);
    }

    // CRITICAL: Slow DB must have been queried EXACTLY ONCE
    assert.equal(ctx.store.queryCount, 1);

    // Subsequent warm-cache request must be instantaneous (< 50ms, no 300-800ms delay)
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

    // Verify ascending date sort
    for (let i = 1; i < body.data.length; i++) {
      const prev = Date.parse(body.data[i - 1]!.date);
      const curr = Date.parse(body.data[i]!.date);
      assert.ok(prev <= curr, 'Events must be sorted by date ascending');
    }
  });

  it('invalidates GET /events/:id and GET /events cache when PATCH /events/:id succeeds', async () => {
    ctx = await startTestServer();
    const { baseUrl } = ctx;

    // Prime both caches
    await fetch(`${baseUrl}/events/1`);
    await fetch(`${baseUrl}/events?page=1`);
    assert.equal(ctx.store.queryCount, 2);

    // Patch event #1
    const patchRes = await fetch(`${baseUrl}/events/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Headline Event' }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as { data: Event };
    assert.equal(patched.data.title, 'Updated Headline Event');

    // Both endpoints must now MISS cache and re-query the store
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

  it('returns uncached random seats immediately without DB delay and 404 for unknown event', async () => {
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

    const missing = await fetch(`${baseUrl}/events/9999/seats`);
    assert.equal(missing.status, 404);
  });

  it('validates inputs with Zod (400) and bypasses rate limiter with x-internal-secret', async () => {
    ctx = await startTestServer({
      internalSecret: 'my-ssr-secret',
      rateLimit: { windowMs: 60_000, max: 2 },
    });
    const { baseUrl } = ctx;

    // Invalid PATCH payload -> 400 VALIDATION_ERROR
    const badPatch = await fetch(`${baseUrl}/events/1`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'my-ssr-secret',
      },
      body: JSON.stringify({}),
    });
    assert.equal(badPatch.status, 400);

    // 5 internal SSR requests with valid secret should bypass the max=2 rate limit completely
    for (let i = 0; i < 5; i++) {
      const ssrRes = await fetch(`${baseUrl}/cities`, {
        headers: { 'x-internal-secret': 'my-ssr-secret' },
      });
      assert.equal(ssrRes.status, 200);
    }

    // Public requests without the header consume the limit (max = 2) and the 3rd gets 429
    const r1 = await fetch(`${baseUrl}/cities`);
    const r2 = await fetch(`${baseUrl}/cities`);
    const r3 = await fetch(`${baseUrl}/cities`);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
  });
});
