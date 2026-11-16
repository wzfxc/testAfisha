import { ApiErrorResponseSchema, type ErrorDetail } from '@app/shared';

export class ApiHttpError extends Error {
  public digest?: string;

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly retryAfter?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.digest = status === 429 ? `RATE_LIMITED:${retryAfter ?? 60}` : `HTTP_${status}`;
  }
}

export class ApiUnavailableError extends Error {
  public digest = 'SERVICE_UNAVAILABLE';

  constructor(
    public readonly reason: 'timeout' | 'network',
    message = 'Сервіс тимчасово недоступний',
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

export function parseRetryAfterHeader(raw: string | null): number | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
  }
  const targetMs = Date.parse(trimmed);
  if (!Number.isNaN(targetMs)) {
    const diffSeconds = Math.ceil((targetMs - Date.now()) / 1000);
    return Math.max(1, diffSeconds);
  }
  return undefined;
}

export async function parseApiHttpError(
  res: Response,
  fallbackMessage: string,
  requestId?: string,
): Promise<ApiHttpError> {
  const retryAfter = parseRetryAfterHeader(res.headers.get('retry-after'));
  const responseRequestId = res.headers.get('x-request-id') ?? requestId;

  let code = `HTTP_${res.status}`;
  let message = fallbackMessage;
  let details: ErrorDetail[] | undefined;
  let finalRequestId = responseRequestId;

  const json: unknown = await res.json().catch(() => null);
  const parsed = ApiErrorResponseSchema.safeParse(json);
  if (parsed.success) {
    code = parsed.data.error.code;
    message = parsed.data.error.message;
    details = parsed.data.error.details;
    finalRequestId = parsed.data.error.requestId || finalRequestId;
  }

  return new ApiHttpError(res.status, code, message, details, retryAfter, finalRequestId);
}

export interface FormattedUserError {
  kind: 'not_found' | 'rate_limited' | 'validation' | 'unavailable';
  message: string;
  retryAfter?: number;
  digest: string;
}

export function formatUserError(err: unknown): FormattedUserError {
  if (err instanceof ApiHttpError) {
    if (err.status === 404) {
      return {
        kind: 'not_found',
        message: 'Подію не знайдено',
        digest: 'NOT_FOUND',
      };
    }
    if (err.status === 429) {
      const waitSeconds = err.retryAfter ?? 60;
      return {
        kind: 'rate_limited',
        message: `Забагато запитів. Спробуйте через ${waitSeconds} с`,
        retryAfter: waitSeconds,
        digest: `RATE_LIMITED:${waitSeconds}`,
      };
    }
    if (err.status === 400 || err.status === 422) {
      return {
        kind: 'validation',
        message: err.message || 'Перевірте коректність введених даних',
        digest: `HTTP_${err.status}`,
      };
    }
    return {
      kind: 'unavailable',
      message: 'Сервіс тимчасово недоступний',
      digest: `HTTP_${err.status}`,
    };
  }

  if (err instanceof ApiUnavailableError) {
    return {
      kind: 'unavailable',
      message: 'Сервіс тимчасово недоступний',
      digest: 'SERVICE_UNAVAILABLE',
    };
  }

  return {
    kind: 'unavailable',
    message: 'Сервіс тимчасово недоступний',
    digest: 'SERVICE_UNAVAILABLE',
  };
}

export function getErrorMessageFromDigest(digest: string | undefined): {
  message: string;
  isRateLimit: boolean;
} {
  if (digest?.startsWith('RATE_LIMITED:')) {
    const rawSeconds = Number(digest.slice('RATE_LIMITED:'.length));
    const seconds = Number.isFinite(rawSeconds) && rawSeconds > 0 ? Math.ceil(rawSeconds) : 60;
    return {
      message: `Забагато запитів. Спробуйте через ${seconds} с`,
      isRateLimit: true,
    };
  }

  return {
    message: 'Сервіс тимчасово недоступний',
    isRateLimit: false,
  };
}
