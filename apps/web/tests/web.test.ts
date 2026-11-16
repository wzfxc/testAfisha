import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_DESCRIPTION_MIN,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  UpdateEventBodySchema,
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
  assert.equal(mapped429.message, 'Забагато запитів. Спробуйте через 17 с');
  assert.equal(getErrorMessageFromDigest(mapped429.digest).message, 'Забагато запитів. Спробуйте через 17 с');

  const err500 = new ApiHttpError(500, 'INTERNAL_ERROR', 'Internal server error');
  assert.equal(formatUserError(err500).kind, 'unavailable');
  assert.equal(formatUserError(err500).message, 'Сервіс тимчасово недоступний');

  const errTimeout = new ApiUnavailableError('timeout');
  assert.equal(formatUserError(errTimeout).message, 'Сервіс тимчасово недоступний');

  const errNetwork = new ApiUnavailableError('network');
  assert.equal(formatUserError(errNetwork).message, 'Сервіс тимчасово недоступний');
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

