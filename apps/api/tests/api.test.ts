import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ApiErrorResponseSchema,
  EVENT_DESCRIPTION_MAX,
  EVENT_DESCRIPTION_MIN,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  type Event,
  type PaginatedEvents,
  type SeatsInfo,
} from '@app/shared';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/index.js';
import { PromiseCache } from '../src/cache/promiseCache.js';
import { createGracefulShutdown } from '../src/lib/shutdown.js';
import { EventService } from '../src/services/eventService.js';
import { EventStore, type AtomicWriter } from '../src/services/eventStore.js';

// Keep `pnpm test` output clean: the API logs every 4xx/5xx and shutdown step.
// The logger reads LOG_LEVEL lazily, so setting it here (after imports) is enough.
// Override with LOG_LEVEL=info to see server logs while debugging tests.
process.env.LOG_LEVEL ??= 'silent';

const SEED_FILE = new URL('../data/events.seed.json', import.meta.url);

interface TestContext {
  baseUrl: string;
  server: Server;
  store: EventStore;
  eventService: EventService;
  tempDir: string;
  runtimeFile: string;
  close: () => Promise<void>;
}

async function startTestServer(
  overrides?: Partial<AppConfig>,
  options?: { atomicWriter?: AtomicWriter; seedOnMissing?: boolean },
): Promise<TestContext> {
  const tempDir = mkdtempSync(join(tmpdir(), 'afisha-api-test-'));
  const runtimeFile = join(tempDir, 'events.json');

  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    internalSecret: 'test-ssr-secret',
    rateLimit: { windowMs: 60_000, max: 200 },
    trustProxyHops: 0,
    corsOrigins: [],
    cache: { ttlMs: 60_000, maxEntries: 500 },
    db: { minDelayMs: 60, maxDelayMs: 80 },
    shutdownTimeoutMs: 5_000,
    dataFile: runtimeFile,
    seedFile: undefined,
    ...overrides,
  };

  const store = new EventStore({
    ...config.db,
    ...(options?.atomicWriter ? { atomicWriter: options.atomicWriter } : {}),
  });
  await store.load(runtimeFile, options?.seedOnMissing === false ? undefined : SEED_FILE);

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
    server,
    store,
    eventService,
    tempDir,
    runtimeFile,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((err) => {
          rmSync(tempDir, { recursive: true, force: true });
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

function assertErrorShape(
  res: Response,
  json: unknown,
  expectedCode: string,
): { code: string; message: string; details?: Array<{ field: string; message: string }> | undefined; requestId: string } {
  const parsed = ApiErrorResponseSchema.parse(json);
  assert.equal(parsed.error.code, expectedCode);
  assert.ok(parsed.error.requestId.length > 0);
  assert.equal(res.headers.get('x-request-id'), parsed.error.requestId);
  return parsed.error;
}

test('cache: repeated GET /events/:id within TTL returns X-Cache HIT in < 50ms without calling storage', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 70, maxDelayMs: 90 } });
  t.after(() => ctx.close());

  const findByIdSpy = t.mock.method(ctx.store, 'findById');

  const missRes = await fetch(`${ctx.baseUrl}/events/1`);
  assert.equal(missRes.status, 200);
  assert.equal(missRes.headers.get('x-cache'), 'MISS');
  assert.equal(findByIdSpy.mock.callCount(), 1);

  const t0 = performance.now();
  const hitRes = await fetch(`${ctx.baseUrl}/events/1`);
  const elapsed = performance.now() - t0;

  assert.equal(hitRes.status, 200);
  assert.equal(hitRes.headers.get('x-cache'), 'HIT');
  assert.ok(elapsed < 50, `Expected warm cache HIT < 50ms, got ${elapsed.toFixed(1)}ms`);
  assert.equal(findByIdSpy.mock.callCount(), 1);
});

test('cache: expires entries after TTL using fake timers and re-reads storage', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const ctx = await startTestServer({
    cache: { ttlMs: 1_000, maxEntries: 50 },
    db: { minDelayMs: 0, maxDelayMs: 0 },
  });
  t.after(() => ctx.close());

  const findByIdSpy = t.mock.method(ctx.store, 'findById');

  const first = await fetch(`${ctx.baseUrl}/events/2`);
  assert.equal(first.headers.get('x-cache'), 'MISS');
  assert.equal(findByIdSpy.mock.callCount(), 1);

  t.mock.timers.tick(500);
  const second = await fetch(`${ctx.baseUrl}/events/2`);
  assert.equal(second.headers.get('x-cache'), 'HIT');
  assert.equal(findByIdSpy.mock.callCount(), 1);

  t.mock.timers.tick(600);
  const third = await fetch(`${ctx.baseUrl}/events/2`);
  assert.equal(third.headers.get('x-cache'), 'MISS');
  assert.equal(findByIdSpy.mock.callCount(), 2);
});

test('cache: evicts least-recently-used entry when maxEntries is exceeded', async (t) => {
  const ctx = await startTestServer({
    cache: { ttlMs: 60_000, maxEntries: 2 },
    db: { minDelayMs: 0, maxDelayMs: 0 },
  });
  t.after(() => ctx.close());

  assert.equal((await fetch(`${ctx.baseUrl}/events/1`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/events/2`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/events/1`)).headers.get('x-cache'), 'HIT');
  assert.equal((await fetch(`${ctx.baseUrl}/events/3`)).headers.get('x-cache'), 'MISS');

  assert.equal((await fetch(`${ctx.baseUrl}/events/1`)).headers.get('x-cache'), 'HIT');
  assert.equal((await fetch(`${ctx.baseUrl}/events/2`)).headers.get('x-cache'), 'MISS');
});

test('cache: PATCH invalidates GET /events/:id and all GET /events pages but preserves GET /cities cache', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  const citiesSpy = t.mock.method(ctx.store, 'listCities');

  assert.equal((await fetch(`${ctx.baseUrl}/events/1`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/events?page=1`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/events?page=2`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/cities`)).headers.get('x-cache'), 'MISS');
  assert.equal(citiesSpy.mock.callCount(), 1);

  const patchRes = await fetch(`${ctx.baseUrl}/events/1`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated Event After Patch' }),
  });
  assert.equal(patchRes.status, 200);

  const itemAfter = await fetch(`${ctx.baseUrl}/events/1`);
  assert.equal(itemAfter.headers.get('x-cache'), 'MISS');
  const itemJson = (await itemAfter.json()) as { data: Event };
  assert.equal(itemJson.data.title, 'Updated Event After Patch');

  assert.equal((await fetch(`${ctx.baseUrl}/events?page=1`)).headers.get('x-cache'), 'MISS');
  assert.equal((await fetch(`${ctx.baseUrl}/events?page=2`)).headers.get('x-cache'), 'MISS');

  const citiesAfter = await fetch(`${ctx.baseUrl}/cities`);
  assert.equal(citiesAfter.headers.get('x-cache'), 'HIT');
  assert.equal(citiesSpy.mock.callCount(), 1);
});

test('cache: separates keys by city, q, page and normalizes case and whitespace', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  const findManySpy = t.mock.method(ctx.store, 'findMany');

  const r1 = await fetch(`${ctx.baseUrl}/events?city=Kyiv&q=Festival&page=1`);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('x-cache'), 'MISS');

  const r2 = await fetch(`${ctx.baseUrl}/events?city=%20kyiv%20&q=%20FESTIVAL%20&page=1`);
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('x-cache'), 'HIT');
  assert.equal(findManySpy.mock.callCount(), 1);

  const r3 = await fetch(`${ctx.baseUrl}/events?city=Lviv&q=Festival&page=1`);
  assert.equal(r3.headers.get('x-cache'), 'MISS');

  const r4 = await fetch(`${ctx.baseUrl}/events?city=Kyiv&page=2`);
  assert.equal(r4.headers.get('x-cache'), 'MISS');
  assert.equal(findManySpy.mock.callCount(), 3);
});

test('concurrency: coalesces 50 identical cold requests into 1 storage read and returns identical data', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 60, maxDelayMs: 80 } });
  t.after(() => ctx.close());

  assert.equal(ctx.store.size, 60);
  const responses = await Promise.all(
    Array.from({ length: 50 }, () => fetch(`${ctx.baseUrl}/events?page=1&limit=10`)),
  );

  assert.equal(ctx.store.queryCount, 1);

  const payloads = await Promise.all(
    responses.map(async (res) => {
      assert.equal(res.status, 200);
      return (await res.json()) as PaginatedEvents;
    }),
  );

  const baseline = JSON.stringify(payloads[0]);
  for (const body of payloads) {
    assert.equal(JSON.stringify(body), baseline);
    assert.equal(body.data.length, 10);
  }
});

test('concurrency: runs separate storage reads for 50 distinct keys', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 5, maxDelayMs: 10 } });
  t.after(() => ctx.close());

  const findByIdSpy = t.mock.method(ctx.store, 'findById');

  const responses = await Promise.all(
    Array.from({ length: 50 }, (_, idx) => fetch(`${ctx.baseUrl}/events/${idx + 1}`)),
  );

  for (const res of responses) {
    assert.equal(res.status, 200);
  }
  assert.equal(findByIdSpy.mock.callCount(), 50);
});

test('concurrency: rejects all waiters on loader error, does not cache failure, and retries on next call', async (t) => {
  const cache = new PromiseCache<string>({ max: 10, ttlMs: 60_000 });
  let attempts = 0;

  const failingBatch = Array.from({ length: 10 }, () =>
    cache.getOrLoad('shared-key', async () => {
      attempts += 1;
      await new Promise((r) => setTimeout(r, 15));
      throw new Error('Transient storage failure');
    }),
  );

  const settled = await Promise.allSettled(failingBatch);
  assert.equal(attempts, 1);
  for (const item of settled) {
    assert.equal(item.status, 'rejected');
  }
  assert.equal(cache.size, 0);

  const recovered = await cache.getOrLoad('shared-key', async () => {
    attempts += 1;
    return 'ok-value';
  });
  assert.equal(attempts, 2);
  assert.equal(recovered.status, 'MISS');
  assert.equal(recovered.value, 'ok-value');

  t.diagnostic('Verified failure eviction without poisoning cache');
});

test('rate-limit: tracks separate buckets per x-client-ip, counts cache hits, and resets via fake timers', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const ctx = await startTestServer({
    internalSecret: 'my-ssr-secret',
    rateLimit: { windowMs: 1_000, max: 2 },
    db: { minDelayMs: 0, maxDelayMs: 0 },
  });
  t.after(() => ctx.close());

  const ipAHeaders = {
    'x-internal-secret': 'my-ssr-secret',
    'x-client-ip': '203.0.113.10',
  };
  const ipBHeaders = {
    'x-internal-secret': 'my-ssr-secret',
    'x-client-ip': '203.0.113.20',
  };

  const a1 = await fetch(`${ctx.baseUrl}/cities`, { headers: ipAHeaders });
  assert.equal(a1.status, 200);
  assert.equal(a1.headers.get('x-cache'), 'MISS');

  const a2 = await fetch(`${ctx.baseUrl}/cities`, { headers: ipAHeaders });
  assert.equal(a2.status, 200);
  assert.equal(a2.headers.get('x-cache'), 'HIT');

  const a3 = await fetch(`${ctx.baseUrl}/cities`, { headers: ipAHeaders });
  assert.equal(a3.status, 429);
  assert.ok(Number(a3.headers.get('retry-after')) >= 1);
  assertErrorShape(a3, await a3.json(), 'RATE_LIMITED');

  const b1 = await fetch(`${ctx.baseUrl}/cities`, { headers: ipBHeaders });
  assert.equal(b1.status, 200);

  t.mock.timers.tick(1_050);

  const aAfterReset = await fetch(`${ctx.baseUrl}/cities`, { headers: ipAHeaders });
  assert.equal(aAfterReset.status, 200);
});

test('rate-limit: ignores spoofed x-client-ip and X-Forwarded-For without valid secret and isolates internal key', async (t) => {
  const ctx = await startTestServer({
    internalSecret: 'my-ssr-secret',
    rateLimit: { windowMs: 60_000, max: 2, internalMax: 2 },
    db: { minDelayMs: 0, maxDelayMs: 0 },
  });
  t.after(() => ctx.close());

  const r1 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: { 'x-client-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.1' },
  });
  const r2 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: {
      'x-internal-secret': 'wrong-secret',
      'x-client-ip': '198.51.100.2',
      'x-forwarded-for': '198.51.100.2',
    },
  });
  const r3 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: { 'x-client-ip': '198.51.100.3', 'x-forwarded-for': '198.51.100.3' },
  });

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 429);

  const i1 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: { 'x-internal-secret': 'my-ssr-secret' },
  });
  const i2 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: { 'x-internal-secret': 'my-ssr-secret' },
  });
  const i3 = await fetch(`${ctx.baseUrl}/cities`, {
    headers: { 'x-internal-secret': 'my-ssr-secret' },
  });

  assert.equal(i1.status, 200);
  assert.equal(i2.status, 200);
  assert.equal(i3.status, 429);
});

test('errors: returns 400 VALIDATION_ERROR with field details for invalid query and PATCH body cases', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  const invalidQueries: Array<{ qs: string; field: string }> = [
    { qs: 'page=abc', field: 'page' },
    { qs: 'page=-1', field: 'page' },
    { qs: 'page=0', field: 'page' },
    { qs: 'limit=0', field: 'limit' },
    { qs: 'limit=51', field: 'limit' },
    { qs: `q=${'a'.repeat(101)}`, field: 'q' },
    { qs: `city=${'c'.repeat(101)}`, field: 'city' },
  ];

  for (const { qs, field } of invalidQueries) {
    const res = await fetch(`${ctx.baseUrl}/events?${qs}`, {
      headers: { 'x-request-id': `req-${field}-check` },
    });
    assert.equal(res.status, 400, `Expected 400 for query ?${qs}`);
    const err = assertErrorShape(res, await res.json(), 'VALIDATION_ERROR');
    assert.equal(err.requestId, `req-${field}-check`);
    assert.ok(
      err.details?.some((d) => d.field === field),
      `Expected details to reference field "${field}" for ?${qs}`,
    );
  }

  const invalidBodies: Array<{ body: Record<string, unknown>; field: string }> = [
    { body: { title: '' }, field: 'title' },
    { body: { title: '     ' }, field: 'title' },
    { body: { title: 't'.repeat(EVENT_TITLE_MIN - 1) }, field: 'title' },
    { body: { title: 't'.repeat(EVENT_TITLE_MAX + 1) }, field: 'title' },
    { body: { description: '' }, field: 'description' },
    { body: { description: '          ' }, field: 'description' },
    { body: { description: 'd'.repeat(EVENT_DESCRIPTION_MIN - 1) }, field: 'description' },
    { body: { description: 'd'.repeat(EVENT_DESCRIPTION_MAX + 1) }, field: 'description' },
    { body: { extraField: 'nope' }, field: 'extraField' },
    { body: {}, field: 'body' },
  ];

  for (const { body, field } of invalidBodies) {
    const res = await fetch(`${ctx.baseUrl}/events/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400);
    const err = assertErrorShape(res, await res.json(), 'VALIDATION_ERROR');
    assert.ok(
      err.details?.some((d) => d.field.includes(field)),
      `Expected details to reference "${field}"`,
    );
  }
});

test('errors: handles 400 INVALID_JSON, 413, 415, 404, 405 with Allow, and 500 without leaking stack traces', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  const badJson = await fetch(`${ctx.baseUrl}/events/1`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{"title": ',
  });
  assert.equal(badJson.status, 400);
  assertErrorShape(badJson, await badJson.json(), 'INVALID_JSON');

  const tooLarge = await fetch(`${ctx.baseUrl}/events/1`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'x'.repeat(25_000) }),
  });
  assert.equal(tooLarge.status, 413);
  assertErrorShape(tooLarge, await tooLarge.json(), 'PAYLOAD_TOO_LARGE');

  const unsupportedType = await fetch(`${ctx.baseUrl}/events/1`, {
    method: 'PATCH',
    headers: { 'content-type': 'text/plain' },
    body: 'title=abc',
  });
  assert.equal(unsupportedType.status, 415);
  assertErrorShape(unsupportedType, await unsupportedType.json(), 'UNSUPPORTED_MEDIA_TYPE');

  const missingEvent = await fetch(`${ctx.baseUrl}/events/9999`);
  assert.equal(missingEvent.status, 404);
  assertErrorShape(missingEvent, await missingEvent.json(), 'NOT_FOUND');

  const nonNumericEvent = await fetch(`${ctx.baseUrl}/events/abc`);
  assert.equal(nonNumericEvent.status, 404);
  assertErrorShape(nonNumericEvent, await nonNumericEvent.json(), 'NOT_FOUND');

  const unknownRoute = await fetch(`${ctx.baseUrl}/does-not-exist`);
  assert.equal(unknownRoute.status, 404);
  assertErrorShape(unknownRoute, await unknownRoute.json(), 'NOT_FOUND');

  const badMethod = await fetch(`${ctx.baseUrl}/events/1`, { method: 'DELETE' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'GET, HEAD, PATCH');
  assertErrorShape(badMethod, await badMethod.json(), 'METHOD_NOT_ALLOWED');

  t.mock.method(ctx.store, 'findById', async () => {
    throw new Error('SECRET_DB_STACK_LEAK_MARKER');
  });
  const serverErr = await fetch(`${ctx.baseUrl}/events/5`, {
    headers: { 'x-request-id': 'req-500-trace' },
  });
  assert.equal(serverErr.status, 500);
  const rawText = await serverErr.text();
  assert.ok(!rawText.includes('SECRET_DB_STACK_LEAK_MARKER'));
  assert.ok(!rawText.includes('at '));
  const errObj = assertErrorShape(serverErr, JSON.parse(rawText), 'INTERNAL_ERROR');
  assert.equal(errObj.requestId, 'req-500-trace');
});

test('persistence: creates runtime file from seed when missing and persists PATCH across store restarts', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  assert.equal(existsSync(ctx.runtimeFile), true);

  const patchRes = await fetch(`${ctx.baseUrl}/events/3`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Persisted Event Title' }),
  });
  assert.equal(patchRes.status, 200);

  const freshStore = new EventStore({ minDelayMs: 0, maxDelayMs: 0 });
  await freshStore.load(ctx.runtimeFile, SEED_FILE);
  assert.equal(freshStore.peekById(3)?.title, 'Persisted Event Title');

  const seedContent = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Event[];
  assert.notEqual(seedContent.find((e) => e.id === 3)?.title, 'Persisted Event Title');
});

test('persistence: serializes two concurrent PATCH calls for different fields of the same event', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 0, maxDelayMs: 0 } });
  t.after(() => ctx.close());

  const [r1, r2] = await Promise.all([
    fetch(`${ctx.baseUrl}/events/4`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Concurrent Title Four' }),
    }),
    fetch(`${ctx.baseUrl}/events/4`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Concurrent Description Four' }),
    }),
  ]);

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);

  const reloaded = new EventStore({ minDelayMs: 0, maxDelayMs: 0 });
  await reloaded.load(ctx.runtimeFile, SEED_FILE);
  const event4 = reloaded.peekById(4);
  assert.equal(event4?.title, 'Concurrent Title Four');
  assert.equal(event4?.description, 'Concurrent Description Four');
});

test('persistence: returns 500 on write failure without mutating memory or invalidating cache', async (t) => {
  let shouldFailWrites = false;
  const ctx = await startTestServer(
    { db: { minDelayMs: 0, maxDelayMs: 0 } },
    {
      atomicWriter: async (targetPath, content) => {
        if (shouldFailWrites) {
          throw new Error('ENOSPC: no space left on device');
        }
        const { defaultAtomicWrite } = await import('../src/services/eventStore.js');
        await defaultAtomicWrite(targetPath, content);
      },
    },
  );
  t.after(() => ctx.close());

  const initialRes = await fetch(`${ctx.baseUrl}/events/7`);
  assert.equal(initialRes.status, 200);
  const initialEvent = ((await initialRes.json()) as { data: Event }).data;

  shouldFailWrites = true;
  const failPatch = await fetch(`${ctx.baseUrl}/events/7`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Should Never Persist' }),
  });
  assert.equal(failPatch.status, 500);
  assertErrorShape(failPatch, await failPatch.json(), 'INTERNAL_ERROR');

  assert.equal(ctx.store.peekById(7)?.title, initialEvent.title);

  const cachedAfterFailure = await fetch(`${ctx.baseUrl}/events/7`);
  assert.equal(cachedAfterFailure.headers.get('x-cache'), 'HIT');
  const cachedEvent = ((await cachedAfterFailure.json()) as { data: Event }).data;
  assert.equal(cachedEvent.title, initialEvent.title);
});

test('seats: returns uncached random integer in 0..capacity without artificial delay', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 80, maxDelayMs: 100 } });
  t.after(() => ctx.close());

  const t0 = performance.now();
  const r1 = await fetch(`${ctx.baseUrl}/events/1/seats`);
  const elapsed = performance.now() - t0;

  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('cache-control'), 'no-store');
  assert.equal(r1.headers.get('x-cache'), null);
  assert.ok(elapsed < 50, `Expected seats response < 50ms, got ${elapsed.toFixed(1)}ms`);
  assert.equal(ctx.store.queryCount, 0);

  const body = (await r1.json()) as { data: SeatsInfo };
  assert.equal(body.data.eventId, 1);
  assert.ok(body.data.availableSeats >= 0 && body.data.availableSeats <= body.data.capacity);
});

test('shutdown: waits for in-flight slow request to return 200, rejects new connections, and closes server cleanly', async (t) => {
  const ctx = await startTestServer({ db: { minDelayMs: 120, maxDelayMs: 150 } });
  const exitCodes: number[] = [];
  const shutdown = createGracefulShutdown({
    server: ctx.server,
    store: ctx.store,
    timeoutMs: 2_000,
    onExit: (code) => {
      exitCodes.push(code);
    },
  });

  t.after(() => {
    rmSync(ctx.tempDir, { recursive: true, force: true });
  });

  const inFlightPromise = new Promise<number>((resolve, reject) => {
    const req = httpRequest(`${ctx.baseUrl}/events?page=1`, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });

  await new Promise((r) => setTimeout(r, 20));
  const shutdownPromise = shutdown('SIGTERM', 0);

  const inFlightStatus = await inFlightPromise;
  assert.equal(inFlightStatus, 200);

  await shutdownPromise;
  assert.deepEqual(exitCodes, [0]);
  assert.equal(ctx.server.listening, false);

  await assert.rejects(fetch(`${ctx.baseUrl}/health`));
});
