import type { Request, RequestHandler, Response } from 'express';
import { RateLimitError } from '../lib/errors.js';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  internalMax?: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

function resolveKeyAndLimit(
  req: Request,
  res: Response,
  userLimit: number,
  internalLimit: number,
): { key: string; limit: number } {
  if (res.locals.isInternalRequest === true) {
    if (res.locals.clientIp !== undefined) {
      return { key: `ip:${res.locals.clientIp}`, limit: userLimit };
    }
    return { key: 'internal', limit: internalLimit };
  }

  const socketIp = req.socket?.remoteAddress ?? req.ip ?? 'unknown';
  return { key: `ip:${socketIp}`, limit: userLimit };
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const buckets = new Map<string, RateBucket>();
  const internalLimit = options.internalMax ?? Math.max(options.max * 100, 1000);

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(1_000, options.windowMs));

  cleanupInterval.unref();

  return (req, res, next) => {
    if (res.locals.isInternalRequest === true && req.get('x-rate-limit-counted') === '1') {
      next();
      return;
    }

    const now = Date.now();
    const { key, limit } = resolveKeyAndLimit(req, res, options.max, internalLimit);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > limit) {
      next(new RateLimitError('Too many requests, please try again later.', resetSeconds));
      return;
    }

    next();
  };
}
