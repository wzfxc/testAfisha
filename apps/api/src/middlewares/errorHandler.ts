import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodIssue } from 'zod';
import type { ErrorDetail } from '@app/shared';
import {
  HttpError,
  InvalidJsonError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

export function methodNotAllowed(allow: string): RequestHandler {
  return (req, _res, next) => {
    next(new MethodNotAllowedError(`Method ${req.method} is not allowed on ${req.originalUrl}`, allow));
  };
}

export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json')) {
    next(new UnsupportedMediaTypeError());
    return;
  }
  next();
};

function formatZodIssueField(issue: ZodIssue): string {
  if (issue.path.length > 0) {
    return issue.path.join('.');
  }
  if (issue.code === 'unrecognized_keys' && 'keys' in issue && Array.isArray(issue.keys)) {
    return issue.keys.join(', ') || 'body';
  }
  return 'body';
}

function getBodyParserProperty(err: unknown, key: 'status' | 'type'): unknown {
  if (typeof err === 'object' && err !== null && key in err) {
    return (err as Record<string, unknown>)[key];
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = res.locals.requestId ?? 'unknown';
  res.setHeader('x-request-id', requestId);

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: ErrorDetail[] | undefined;

  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((issue) => ({
      field: formatZodIssueField(issue),
      message: issue.message,
    }));
  } else if (err instanceof HttpError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
    if (err.headers) {
      for (const [headerName, headerValue] of Object.entries(err.headers)) {
        res.setHeader(headerName, headerValue);
      }
    }
  } else {
    const parserType = getBodyParserProperty(err, 'type');
    const parserStatus = getBodyParserProperty(err, 'status');

    if (parserType === 'entity.parse.failed' || (err instanceof SyntaxError && parserStatus === 400)) {
      const mapped = new InvalidJsonError();
      statusCode = mapped.statusCode;
      code = mapped.code;
      message = mapped.message;
    } else if (parserType === 'entity.too.large' || parserStatus === 413) {
      const mapped = new PayloadTooLargeError();
      statusCode = mapped.statusCode;
      code = mapped.code;
      message = mapped.message;
    } else if (typeof parserStatus === 'number' && parserStatus >= 400 && parserStatus < 500) {
      statusCode = parserStatus;
      code = 'BAD_REQUEST';
      message = err instanceof Error ? err.message : 'Bad request';
    }
  }

  const logMessage =
    err instanceof ZodError
      ? err.issues.map((issue) => `${formatZodIssueField(issue)}: ${issue.message}`).join('; ')
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(
    `[error] ${req.method} ${req.originalUrl} status=${statusCode} code=${code} requestId=${requestId} message=${JSON.stringify(logMessage)}`,
  );
  if (statusCode >= 500 && err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId,
    },
  });
};
