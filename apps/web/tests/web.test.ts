import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_DESCRIPTION_MIN,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  UpdateEventBodySchema,
  type Event,
  type PaginatedEvents,
} from '@app/shared';
import {
  ApiHttpError,
  ApiUnavailableError,
  formatUserError,
  getErrorMessageFromDigest,
} from '../src/lib/api-errors';
import {
  MAX_FAVORITE_IDS,
  parseFavoriteIds,
  serializeFavoriteIds,
} from '../src/lib/favorites-codec';
import { buildHref } from '../src/lib/search-href';
import {
  collectNearestUpcoming,
  PRERENDER_EVENT_COUNT,
  pickNearestUpcoming,
} from '../src/lib/nearest-events';

test('favorites codec: returns empty array for invalid cookie without throwing', () => {
  assert.deepEqual(parseFavoriteIds(undefined), []);
  assert.deepEqual(parseFavoriteIds(''), []);
  assert.deepEqual(parseFavoriteIds('not-json{'), []);
  assert.deepEqual(parseFavoriteIds(JSON.stringify({ id: 1 })), []);
  assert.deepEqual(parseFavoriteIds(JSON.stringify(['1', -2, 0, 3.5])), []);
});

test('favorites codec: deduplicates IDs and enforces max favorites limit', () => {
  const withDupes = JSON.stringify([5, 2, 5, 10, 2]);
  assert.deepEqual(parseFavoriteIds(withDupes), [5, 2, 10]);

  const overLimit = Array.from({ length: MAX_FAVORITE_IDS + 20 }, (_, i) => i + 1);
  const parsed = parseFavoriteIds(JSON.stringify(overLimit));
  assert.equal(parsed.length, MAX_FAVORITE_IDS);

  const serialized = serializeFavoriteIds([1, 1, 2, -5, 3, ...overLimit]);
  assert.equal(serialized.uniqueIds.length, MAX_FAVORITE_IDS);
  assert.equal(JSON.parse(serialized.json).length, MAX_FAVORITE_IDS);
});

test('api error mapping: maps 404, 429 with retry-after, 5xx, timeout, and network to user-friendly messages', () => {
  const err404 = new ApiHttpError(404, 'NOT_FOUND', 'Event not found');
  assert.equal(formatUserError(err404).kind, 'not_found');

  const err429 = new ApiHttpError(429, 'RATE_LIMITED', 'Slow down', undefined, 17);
  const mapped429 = formatUserError(err429);
  assert.equal(mapped429.kind, 'rate_limited');
  assert.equal(mapped429.message, 'Too many requests. Please try again in 17s.');
  assert.equal(
    getErrorMessageFromDigest(mapped429.digest).message,
    'Too many requests. Please try again in 17s.',
  );

  const err500 = new ApiHttpError(500, 'INTERNAL_ERROR', 'Internal server error');
  assert.equal(formatUserError(err500).kind, 'unavailable');
  assert.equal(formatUserError(err500).message, 'Service temporarily unavailable');

  const errTimeout = new ApiUnavailableError('timeout');
  assert.equal(formatUserError(errTimeout).message, 'Service temporarily unavailable');

  const errNetwork = new ApiUnavailableError('network');
  assert.equal(formatUserError(errNetwork).message, 'Service temporarily unavailable');
});

test('buildHref: omits empty q and page=1 while preserving active filters and pages > 1', () => {
  assert.equal(buildHref('/', { q: '', city: '', page: 1 }), '/');
  assert.equal(buildHref('/', { q: '   ', city: 'Kyiv', page: 1 }), '/?city=Kyiv');
  assert.equal(buildHref('/', { q: 'jazz', city: 'Kyiv', page: 2 }), '/?city=Kyiv&q=jazz&page=2');
  assert.equal(buildHref('/', { q: 'jazz', page: 1 }), '/?q=jazz');
});

test('form validation: enforces shared title and description length bounds and trims whitespace', () => {
  const valid = UpdateEventBodySchema.safeParse({
    title: '  Summer Jazz Night  ',
    description: '  A curated evening of live jazz performances in Kyiv.  ',
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.title, 'Summer Jazz Night');
  }

  assert.equal(UpdateEventBodySchema.safeParse({ title: '   ' }).success, false);
  assert.equal(UpdateEventBodySchema.safeParse({ title: 'a'.repeat(EVENT_TITLE_MIN - 1) }).success, false);
  assert.equal(UpdateEventBodySchema.safeParse({ title: 'a'.repeat(EVENT_TITLE_MAX + 1) }).success, false);
  assert.equal(UpdateEventBodySchema.safeParse({ description: '          ' }).success, false);
  assert.equal(
    UpdateEventBodySchema.safeParse({ description: 'd'.repeat(EVENT_DESCRIPTION_MIN - 1) }).success,
    false,
  );
  assert.equal(
    UpdateEventBodySchema.safeParse({ description: 'd'.repeat(EVENT_DESCRIPTION_MAX + 1) }).success,
    false,
  );
});


const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeEvent(id: number, offsetDays: number): Event {
  return {
    id,
    title: `Event ${id}`,
    description: 'Description',
    city: 'Kyiv',
    venue: 'Venue',
    date: new Date(NOW + offsetDays * DAY_MS).toISOString(),
    capacity: 100,
  };
}

test('pickNearestUpcoming: drops past events, sorts by date and caps at count', () => {
  const events = [
    makeEvent(1, -3),
    makeEvent(2, 5),
    makeEvent(3, 1),
    makeEvent(4, -1),
    ...Array.from({ length: 20 }, (_, i) => makeEvent(100 + i, 10 + i)),
  ];
  const picked = pickNearestUpcoming(events, NOW, PRERENDER_EVENT_COUNT);
  assert.equal(picked.length, 15);
  assert.deepEqual(
    picked.slice(0, 3).map((e) => e.id),
    [3, 2, 100],
  );
  assert.ok(picked.every((e) => Date.parse(e.date) >= NOW));
  for (let i = 1; i < picked.length; i += 1) {
    assert.ok(Date.parse(picked[i - 1]!.date) <= Date.parse(picked[i]!.date));
  }
});

test('pickNearestUpcoming: includes an event exactly at "now" and returns all when fewer than count', () => {
  const picked = pickNearestUpcoming([makeEvent(2, 2), makeEvent(1, 0), makeEvent(3, -2)], NOW, 15);
  assert.deepEqual(picked.map((e) => e.id), [1, 2]);
  assert.deepEqual(pickNearestUpcoming([makeEvent(1, -1)], NOW, 15), []);
});

test('pickNearestUpcoming: breaks date ties by id', () => {
  const picked = pickNearestUpcoming([makeEvent(7, 1), makeEvent(5, 1)], NOW, 15);
  assert.deepEqual(picked.map((e) => e.id), [5, 7]);
});

test('collectNearestUpcoming: pages through the API until enough upcoming events are found', async () => {
  // 60 events sorted by date: first 45 in the past, last 15 upcoming.
  const all = Array.from({ length: 60 }, (_, i) => makeEvent(i + 1, i - 45));
  const requested: number[] = [];
  const fetchPage = async (page: number, limit: number): Promise<PaginatedEvents> => {
    requested.push(page);
    const data = all.slice((page - 1) * limit, page * limit);
    return { data, meta: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) } };
  };
  const picked = await collectNearestUpcoming(fetchPage, NOW, 15, 20);
  assert.deepEqual(requested, [1, 2, 3]);
  assert.deepEqual(picked.map((e) => e.id), all.slice(45).map((e) => e.id));
});

test('collectNearestUpcoming: stops after the first page when it already has enough upcoming events', async () => {
  const all = Array.from({ length: 60 }, (_, i) => makeEvent(i + 1, i + 1));
  const requested: number[] = [];
  const picked = await collectNearestUpcoming(
    async (page, limit) => {
      requested.push(page);
      return {
        data: all.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
      };
    },
    NOW,
  );
  assert.deepEqual(requested, [1]);
  assert.equal(picked.length, 15);
  assert.equal(picked[0]!.id, 1);
});

test('collectNearestUpcoming: returns fewer than 15 when not enough upcoming events exist', async () => {
  const all = [makeEvent(1, -2), makeEvent(2, 1), makeEvent(3, 2)];
  const picked = await collectNearestUpcoming(
    async (page, limit) => ({
      data: all.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: all.length, totalPages: 1 },
    }),
    NOW,
  );
  assert.deepEqual(picked.map((e) => e.id), [2, 3]);
});
