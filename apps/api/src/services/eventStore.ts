import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { EventSchema, type Event, type EventFilter } from '@app/shared';
import { randomBetween, sleep } from '../lib/delay.js';

export type AtomicWriter = (targetPath: string, content: string) => Promise<void>;

export interface EventStoreOptions {
  minDelayMs: number;
  maxDelayMs: number;
  atomicWriter?: AtomicWriter;
}

export interface EventPatch {
  title?: string | undefined;
  description?: string | undefined;
}

function toFilePath(input: URL | string): string {
  return input instanceof URL ? fileURLToPath(input) : resolve(input);
}

function isEnoentError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

export async function defaultAtomicWrite(targetPath: string, content: string): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(
    dir,
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
  } catch (err) {
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }
}

export class EventStore {
  private readonly events = new Map<number, Event>();
  private readonly atomicWriter: AtomicWriter;
  private runtimeFilePath: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private queries = 0;

  constructor(private readonly options: EventStoreOptions) {
    this.atomicWriter = options.atomicWriter ?? defaultAtomicWrite;
  }

  async load(runtimeFile: URL | string, seedFile?: URL | string): Promise<void> {
    const resolvedRuntime = toFilePath(runtimeFile);
    this.runtimeFilePath = resolvedRuntime;

    let raw: string;
    try {
      raw = await readFile(resolvedRuntime, 'utf8');
    } catch (err) {
      if (!isEnoentError(err) || seedFile === undefined) {
        throw err;
      }
      const resolvedSeed = toFilePath(seedFile);
      const seedRaw = await readFile(resolvedSeed, 'utf8');
      const seededEvents = z.array(EventSchema).parse(JSON.parse(seedRaw));
      await this.atomicWriter(
        resolvedRuntime,
        `${JSON.stringify(seededEvents, null, 2)}\n`,
      );
      this.events.clear();
      for (const event of seededEvents) {
        this.events.set(event.id, event);
      }
      return;
    }

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

  update(id: number, patch: EventPatch): Promise<Event | null> {
    const task = this.writeQueue.then(async () => {
      const current = this.events.get(id);
      if (!current) {
        return null;
      }

      const next: Event = {
        ...current,
        title: patch.title ?? current.title,
        description: patch.description ?? current.description,
      };

      const snapshot = [...this.events.values()]
        .map((event) => (event.id === id ? next : event))
        .sort((a, b) => a.id - b.id);

      if (this.runtimeFilePath !== null) {
        await this.atomicWriter(
          this.runtimeFilePath,
          `${JSON.stringify(snapshot, null, 2)}\n`,
        );
      }

      this.events.set(id, next);
      return next;
    });

    this.writeQueue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  async flushPendingWrites(): Promise<void> {
    await this.writeQueue;
  }

  private async simulateLatency(): Promise<void> {
    this.queries += 1;
    await sleep(randomBetween(this.options.minDelayMs, this.options.maxDelayMs));
  }
}
