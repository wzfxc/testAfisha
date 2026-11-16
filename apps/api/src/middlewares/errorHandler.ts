import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError, NotFoundError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

/** Errors raised by body-parser etc. expose a 4xx `status` and are safe to forward. */
function getClientErrorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const { status } = err;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return status;
    }
  }
  return undefined;
}

/** Global error handler — must be registered last. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  const clientStatus = getClientErrorStatus(err);
  if (clientStatus !== undefined) {
    // e.g. malformed JSON body (400) or payload too large (413)
    const message = err instanceof Error ? err.message : 'Bad request';
    res.status(clientStatus).json({ error: { code: 'BAD_REQUEST', message } });
    return;
  }

  console.error('[error] Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
  });
};

