import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  INTERNAL_SECRET: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  CORS_ORIGINS: z.string().default(''),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
  DB_MIN_DELAY_MS: z.coerce.number().int().min(0).default(300),
  DB_MAX_DELAY_MS: z.coerce.number().int().min(0).default(800),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  internalSecret: string | undefined;
  rateLimit: { windowMs: number; max: number };
  trustProxyHops: number;
  corsOrigins: string[];
  cache: { ttlMs: number; maxEntries: number };
  db: { minDelayMs: number; maxDelayMs: number };
  shutdownTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);

  if (e.NODE_ENV === 'production' && !e.INTERNAL_SECRET) {
    throw new Error('INTERNAL_SECRET environment variable is required in production');
  }

  if (e.DB_MIN_DELAY_MS > e.DB_MAX_DELAY_MS) {
    throw new Error('DB_MIN_DELAY_MS must be <= DB_MAX_DELAY_MS');
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    internalSecret: e.INTERNAL_SECRET,
    rateLimit: { windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX },
    trustProxyHops: e.TRUST_PROXY_HOPS,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    cache: { ttlMs: e.CACHE_TTL_MS, maxEntries: e.CACHE_MAX_ENTRIES },
    db: { minDelayMs: e.DB_MIN_DELAY_MS, maxDelayMs: e.DB_MAX_DELAY_MS },
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
  };
}
