import type { ErrorDetail } from '@app/shared';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export { HttpError as AppError };

export class ValidationError extends HttpError {
  constructor(message = 'Request validation failed', details?: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class InvalidJsonError extends HttpError {
  constructor(message = 'Malformed JSON request body') {
    super(400, 'INVALID_JSON', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class MethodNotAllowedError extends HttpError {
  constructor(message: string, allow: string) {
    super(405, 'METHOD_NOT_ALLOWED', message, undefined, { Allow: allow });
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(message = 'Request body exceeds maximum size limit') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export class UnsupportedMediaTypeError extends HttpError {
  constructor(message = 'Content-Type must be application/json') {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }
}

export class RateLimitError extends HttpError {
  constructor(message: string, retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', message, undefined, {
      'Retry-After': String(retryAfterSeconds),
    });
  }
}
