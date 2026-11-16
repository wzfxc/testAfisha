/** Base class for expected, client-facing errors. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

