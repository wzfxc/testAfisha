import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

/**
 * Per-IP rate limiter. Requests flagged by `internalBypass` (valid
 * `x-internal-secret`) are skipped entirely: they are neither blocked nor counted.
 * Must be mounted after `internalBypass`.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (_req, res) => res.locals.isInternalRequest === true,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
      });
    },
  });
}

