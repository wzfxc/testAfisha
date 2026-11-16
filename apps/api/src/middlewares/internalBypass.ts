import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

declare global {
  // Typed `res.locals` so we never need `any`.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      isInternalRequest?: boolean;
    }
  }
}

/**
 * Flags requests that carry the correct shared secret (sent by the Next.js
 * server during SSR/pre-rendering) so the rate limiter can skip them.
 * If no secret is configured the bypass is disabled entirely.
 */
export function internalBypass(secret: string | undefined): RequestHandler {
  const expected = secret === undefined ? undefined : Buffer.from(secret);

  return (req, res, next) => {
    let internal = false;
    const provided = req.get(INTERNAL_SECRET_HEADER);

    if (expected !== undefined && provided !== undefined) {
      const candidate = Buffer.from(provided);
      // timingSafeEqual throws on length mismatch, so compare lengths first.
      internal = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    }

    res.locals.isInternalRequest = internal;
    next();
  };
}

