import type {
  Event,
  ListEventsQuery,
  PaginatedEvents,
  SeatsInfo,
  UpdateEventBody,
} from '@app/shared';
import { PromiseCache, type CacheResult, type PromiseCacheOptions } from '../cache/promiseCache.js';
import { randomBetween } from '../lib/delay.js';
import { NotFoundError } from '../lib/errors.js';
import type { EventStore } from './eventStore.js';

const CITIES_KEY = 'cities';

/**
 * Business layer: puts the Promise cache in front of the slow store and owns
 * cache invalidation.
 */
export class EventService {
  /** `GET /events` — one entry per (city, q, page, limit) combination. */
  private readonly listCache: PromiseCache<PaginatedEvents>;
  /** `GET /events/:id` — resolves to null for unknown ids (negative caching). */
  private readonly itemCache: PromiseCache<Event | null>;
  /** `GET /cities` */
  private readonly citiesCache: PromiseCache<string[]>;

  constructor(
    private readonly store: EventStore,
    cacheOptions: PromiseCacheOptions,
  ) {
    this.listCache = new PromiseCache(cacheOptions);
    this.itemCache = new PromiseCache(cacheOptions);
    this.citiesCache = new PromiseCache(cacheOptions);
  }

  list(query: ListEventsQuery): Promise<CacheResult<PaginatedEvents>> {
    const key = JSON.stringify([
      query.city?.toLowerCase() ?? null,
      query.q?.toLowerCase() ?? null,
      query.page,
      query.limit,
    ]);

    return this.listCache.getOrLoad(key, async () => {
      const all = await this.store.findMany({ city: query.city, q: query.q });
      const total = all.length;
      const offset = (query.page - 1) * query.limit;
      return {
        data: all.slice(offset, offset + query.limit),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    });
  }

  async get(id: number): Promise<CacheResult<Event>> {
    const { value, status } = await this.itemCache.getOrLoad(String(id), () => this.store.findById(id));
    if (value === null) {
      throw new NotFoundError(`Event ${id} not found`);
    }
    return { value, status };
  }

  cities(): Promise<CacheResult<string[]>> {
    return this.citiesCache.getOrLoad(CITIES_KEY, () => this.store.listCities());
  }

  /** Never cached: a fresh random number on every call. */
  seats(id: number): SeatsInfo {
    const event = this.store.peekById(id);
    if (!event) {
      throw new NotFoundError(`Event ${id} not found`);
    }
    return {
      eventId: event.id,
      capacity: event.capacity,
      availableSeats: randomBetween(0, event.capacity),
    };
  }

  update(id: number, patch: UpdateEventBody): Event {
    const updated = this.store.update(id, patch);
    if (!updated) {
      throw new NotFoundError(`Event ${id} not found`);
    }
    // Explicit invalidation: the single-event entry and every cached list page.
    this.itemCache.delete(String(id));
    this.listCache.clear();
    return updated;
  }
}
