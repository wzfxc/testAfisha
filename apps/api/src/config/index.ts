import { readFileSync } from 'node:fs';
import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  INTERNAL_SECRET: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  INTERNAL_SECRET_FILE: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  CORS_ORIGINS: z.string().default(''),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
  DB_MIN_DELAY_MS: z.coerce.number().int().min(0).default(300),
  DB_MAX_DELAY_MS: z.coerce.number().int().min(0).default(800),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATA_FILE: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  SEED_FILE: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  internalSecret: string | undefined;
  rateLimit: { windowMs: number; max: number; internalMax?: number | undefined };
  trustProxyHops: number;
  corsOrigins: string[];
  cache: { ttlMs: number; maxEntries: number };
  db: { minDelayMs: number; maxDelayMs: number };
  shutdownTimeoutMs: number;
  dataFile: string | undefined;
  seedFile: string | undefined;
}

function resolveInternalSecret(
  envSecret: string | undefined,
  secretFilePath: string | undefined,
  nodeEnv: 'development' | 'production' | 'test',
): string | undefined {
  let resolved = envSecret;

  if (secretFilePath) {
    let raw: string;
    try {
      raw = readFileSync(secretFilePath, 'utf8').trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read INTERNAL_SECRET_FILE (${secretFilePath}): ${msg}`);
    }
    if (!raw) {
      throw new Error(`INTERNAL_SECRET_FILE (${secretFilePath}) is empty`);
    }
    resolved = raw;
  }

  if (nodeEnv === 'production' && !resolved) {
    throw new Error('INTERNAL_SECRET or INTERNAL_SECRET_FILE is required in production');
  }

  return resolved;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  const internalSecret = resolveInternalSecret(
    e.INTERNAL_SECRET,
    e.INTERNAL_SECRET_FILE,
    e.NODE_ENV,
  );

  if (e.DB_MIN_DELAY_MS > e.DB_MAX_DELAY_MS) {
    throw new Error('DB_MIN_DELAY_MS must be <= DB_MAX_DELAY_MS');
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    internalSecret,
    rateLimit: { windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX },
    trustProxyHops: e.TRUST_PROXY_HOPS,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    cache: { ttlMs: e.CACHE_TTL_MS, maxEntries: e.CACHE_MAX_ENTRIES },
    db: { minDelayMs: e.DB_MIN_DELAY_MS, maxDelayMs: e.DB_MAX_DELAY_MS },
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    dataFile: e.DATA_FILE,
    seedFile: e.SEED_FILE,
  };
}
