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

export class EventService {
  private readonly listCache: PromiseCache<PaginatedEvents>;
  private readonly itemCache: PromiseCache<Event | null>;
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
    const normalizedCity = query.city?.trim().toLowerCase() || undefined;
    const normalizedQ = query.q?.trim().toLowerCase() || undefined;
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 12);

    const key = JSON.stringify({
      city: normalizedCity ?? null,
      q: normalizedQ ?? null,
      page,
      limit,
    });

    return this.listCache.getOrLoad(key, async () => {
      const all = await this.store.findMany({
        city: normalizedCity,
        q: normalizedQ,
      });
      const total = all.length;
      const offset = (page - 1) * limit;
      return {
        data: all.slice(offset, offset + limit),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
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
    this.itemCache.delete(String(id));
    this.listCache.clear();
    return updated;
  }
}
