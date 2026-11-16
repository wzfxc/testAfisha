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

export class EventStore {
  private readonly events = new Map<number, Event>();
  private queries = 0;

  constructor(private readonly options: EventStoreOptions) {}

  async load(file: URL | string): Promise<void> {
    const raw = await readFile(file, 'utf8');
    const parsed = z.array(EventSchema).parse(JSON.parse(raw));
    this.events.clear();
    for (const event of parsed) {
      this.events.set(event.id, event);
    }
  }

  get queryCount(): number {
    return this.queries;
  }

  get size(): number {
    return this.events.size;
  }

  async findMany(filter: EventFilter): Promise<Event[]> {
    await this.simulateLatency();

    const city = filter.city?.trim().toLowerCase() || undefined;
    const q = filter.q?.trim().toLowerCase() || undefined;

    return [...this.events.values()]
      .filter((e) => (!city ? true : e.city.toLowerCase() === city))
      .filter((e) => (!q ? true : e.title.toLowerCase().includes(q)))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id);
  }

  async findById(id: number): Promise<Event | null> {
    await this.simulateLatency();
    return this.events.get(id) ?? null;
  }

  async listCities(): Promise<string[]> {
    await this.simulateLatency();
    const cities = new Set<string>();
    for (const event of this.events.values()) {
      cities.add(event.city);
    }
    return [...cities].sort((a, b) => a.localeCompare(b));
  }

  peekById(id: number): Event | null {
    return this.events.get(id) ?? null;
  }

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
