import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { EventSchema, type Event, type EventFilter } from '@app/shared';
import { randomBetween, sleep } from '../lib/delay.js';

export interface EventStoreOptions {
  minDelayMs: number;
  maxDelayMs: number;
}

export interface EventPatch {
  title?: string | undefined;
  description?: string | undefined;
}

/**
 * In-memory "database". The JSON file is read once at startup; every read that
 * goes through the simulated DB (`findMany`, `findById`, `listCities`) waits
 * 300–800 ms (configurable). `peekById` is the fast path used for seats.
 */
export class EventStore {
  private readonly events = new Map<number, Event>();
  private queries = 0;

  constructor(private readonly options: EventStoreOptions) {}

  /** Reads and validates the JSON file into memory. Call once at startup. */
  async load(file: URL | string): Promise<void> {
    const raw = await readFile(file, 'utf8');
    const parsed = z.array(EventSchema).parse(JSON.parse(raw));
    this.events.clear();
    for (const event of parsed) {
      this.events.set(event.id, event);
    }
  }

  /** Number of slow-DB queries executed so far (used to verify caching). */
  get queryCount(): number {
    return this.queries;
  }

  get size(): number {
    return this.events.size;
  }

  /** Slow query: filtered events sorted by date ascending. */
  async findMany(filter: EventFilter): Promise<Event[]> {
    await this.simulateLatency();

    const city = filter.city?.toLowerCase();
    const q = filter.q?.toLowerCase();

    return [...this.events.values()]
      .filter((e) => (city === undefined ? true : e.city.toLowerCase() === city))
      .filter((e) => (q === undefined ? true : e.title.toLowerCase().includes(q)))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id);
  }

  /** Slow query: single event or null. */
  async findById(id: number): Promise<Event | null> {
    await this.simulateLatency();
    return this.events.get(id) ?? null;
  }

  /** Slow query: sorted unique city names. */
  async listCities(): Promise<string[]> {
    await this.simulateLatency();
    const cities = new Set<string>();
    for (const event of this.events.values()) {
      cities.add(event.city);
    }
    return [...cities].sort((a, b) => a.localeCompare(b));
  }

  /** Fast, synchronous lookup that bypasses the simulated latency. */
  peekById(id: number): Event | null {
    return this.events.get(id) ?? null;
  }

  /**
   * Applies a patch in memory. Records are replaced (never mutated) so any
   * snapshot already handed out stays consistent.
   */
  update(id: number, patch: EventPatch): Event | null {
    const current = this.events.get(id);
    if (!current) {
      return null;
    }
    const next: Event = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
    };
    this.events.set(id, next);
    return next;
  }

  private async simulateLatency(): Promise<void> {
    this.queries += 1;
    await sleep(randomBetween(this.options.minDelayMs, this.options.maxDelayMs));
  }
}
