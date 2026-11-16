import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

declare global {
  namespace Express {
    interface Locals {
      requestId?: string;
      isInternalRequest?: boolean;
      clientIp?: string | undefined;
    }
  }
}

export function internalBypass(secret: string | undefined): RequestHandler {
  const expected = secret === undefined ? undefined : Buffer.from(secret);

  return (req, res, next) => {
    let internal = false;
    const provided = req.get(INTERNAL_SECRET_HEADER);

    if (expected !== undefined && provided !== undefined) {
      const candidate = Buffer.from(provided);
      internal = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    }

    let validClientIp: string | undefined;
    if (internal) {
      const rawClientIp = req.get(CLIENT_IP_HEADER)?.trim();
      if (rawClientIp && isIP(rawClientIp) !== 0) {
        validClientIp = rawClientIp;
      }
    }

    res.locals.isInternalRequest = internal;
    res.locals.clientIp = validClientIp;
    next();
  };
}
