import { LRUCache } from 'lru-cache';

export type CacheStatus = 'HIT' | 'MISS';

export interface CacheResult<V> {
  value: V;
  status: CacheStatus;
}

export interface PromiseCacheOptions {
  /** Maximum number of entries (LRU eviction beyond this). */
  max: number;
  /** Entry time-to-live in milliseconds. */
  ttlMs: number;
}

/**
 * LRU cache that stores the **Promise** of a load operation rather than the
 * resolved value. Concurrent callers on a cold key all receive the very same
 * in-flight promise, so the loader runs exactly once (no thundering herd).
 *
 * - Rejected promises are evicted so errors are never cached.
 * - Hits resolve on the next microtask: no artificial delay is involved.
 */
export class PromiseCache<V> {
  private readonly cache: LRUCache<string, Promise<V>>;

  constructor(options: PromiseCacheOptions) {
    this.cache = new LRUCache<string, Promise<V>>({
      max: options.max,
      ttl: options.ttlMs,
    });
  }

  getOrLoad(key: string, loader: () => Promise<V>): Promise<CacheResult<V>> {
    // NOTE: lookup + insert happen synchronously (no `await` in between), which
    // is what makes concurrent callers share a single in-flight promise.
    const cached = this.cache.get(key);
    if (cached) {
      return cached.then((value) => ({ value, status: 'HIT' as const }));
    }

    // The async IIFE also converts synchronous loader throws into rejections.
    const promise = (async () => loader())();
    this.cache.set(key, promise);

    promise.catch(() => {
      // Only drop our own entry; it may already have been replaced after an invalidation.
      if (this.cache.peek(key) === promise) {
        this.cache.delete(key);
      }
    });

    return promise.then((value) => ({ value, status: 'MISS' as const }));
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

