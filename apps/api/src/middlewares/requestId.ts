import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function normalizeRequestId(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (trimmed && VALID_REQUEST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = normalizeRequestId(req.get(REQUEST_ID_HEADER));
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
