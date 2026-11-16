import 'server-only';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import {
  EventSchema,
  PaginatedEventsSchema,
  SeatsInfoSchema,
  type Event,
  type PaginatedEvents,
  type SeatsInfo,
  type UpdateEventBody,
} from '@app/shared';
import { z } from 'zod';
import {
  ApiHttpError,
  ApiUnavailableError,
  parseApiHttpError,
} from '@/lib/api-errors';
import { getInternalSecret } from '@/lib/secret';

export { ApiHttpError, ApiUnavailableError };

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:4000';
const DEFAULT_API_TIMEOUT_MS = 5_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function getApiTimeoutMs(): number {
  const raw = Number(process.env.API_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_API_TIMEOUT_MS;
}

export async function getClientIp(): Promise<string | undefined> {
  try {
    const hdrs = await headers();
    const xff = hdrs.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first && isIP(first) !== 0) {
        return first;
      }
    }

    const xRealIp = hdrs.get('x-real-ip')?.trim();
    if (xRealIp && isIP(xRealIp) !== 0) {
      return xRealIp;
    }

    return '127.0.0.1';
  } catch {
    return undefined;
  }
}

async function getIncomingRequestId(): Promise<string | undefined> {
  try {
    const hdrs = await headers();
    const raw = hdrs.get('x-request-id')?.trim();
    if (raw && REQUEST_ID_PATTERN.test(raw)) {
      return raw;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function isRateLimitAlreadyCounted(): Promise<boolean> {
  try {
    const hdrs = await headers();
    return hdrs.get('x-rate-limit-counted') === '1';
  } catch {
    return false;
  }
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  );
}

interface InternalFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  clientIp?: string | undefined;
  rateLimitCounted?: boolean | undefined;
  requestId?: string | undefined;
}

async function internalFetch(path: string, options: InternalFetchOptions = {}): Promise<Response> {
  const secret = getInternalSecret();
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const { clientIp, rateLimitCounted, requestId, headers: customHeaders, ...rest } = options;
  const resolvedRequestId = requestId ?? randomUUID();

  try {
    return await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(getApiTimeoutMs()),
      headers: {
        Accept: 'application/json',
        'x-request-id': resolvedRequestId,
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(secret ? { 'x-internal-secret': secret } : {}),
        ...(clientIp ? { 'x-client-ip': clientIp } : {}),
        ...(rateLimitCounted ? { 'x-rate-limit-counted': '1' } : {}),
        ...customHeaders,
      },
    });
  } catch (err: unknown) {
    throw new ApiUnavailableError(
      isTimeoutError(err) ? 'timeout' : 'network',
      'Service temporarily unavailable',
      resolvedRequestId,
    );
  }
}

export interface FetchEventsParams {
  city?: string | undefined;
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface FetchEventsOptions {
  cache?: RequestCache;
  includeClientIp?: boolean;
}

export async function fetchEvents(
  params: FetchEventsParams = {},
  options: FetchEventsOptions = { cache: 'no-store', includeClientIp: true },
): Promise<PaginatedEvents> {
  const search = new URLSearchParams();
  const cleanCity = params.city?.trim();
  const cleanQ = params.q?.trim();

  if (cleanCity && cleanCity !== 'undefined' && cleanCity !== 'null') {
    search.set('city', cleanCity);
  }
  if (cleanQ && cleanQ !== 'undefined' && cleanQ !== 'null') {
    search.set('q', cleanQ);
  }
  if (params.page && Number.isFinite(params.page) && params.page > 0) {
    search.set('page', String(params.page));
  }
  if (params.limit && Number.isFinite(params.limit) && params.limit > 0) {
    search.set('limit', String(params.limit));
  }

  const cacheMode = options.cache ?? 'no-store';
  const shouldIncludeIp = options.includeClientIp !== false && cacheMode !== 'force-cache';
  const [clientIp, rateLimitCounted, requestId] = shouldIncludeIp
    ? await Promise.all([
        getClientIp(),
        isRateLimitAlreadyCounted(),
        getIncomingRequestId(),
      ])
    : [undefined, false, undefined];

  const qs = search.toString();
  const resolvedRequestId = requestId ?? randomUUID();
  const res = await internalFetch(`/events${qs ? `?${qs}` : ''}`, {
    cache: cacheMode,
    clientIp,
    rateLimitCounted,
    requestId: resolvedRequestId,
  });

  if (!res.ok) {
    throw await parseApiHttpError(
      res,
      `Failed to fetch events (${res.status})`,
      resolvedRequestId,
    );
  }

  const json: unknown = await res.json();
  return PaginatedEventsSchema.parse(json);
}

const SingleEventResponseSchema = z.object({
  data: EventSchema,
});

export async function fetchEventById(
  id: number,
  options: { cache?: RequestCache } = { cache: 'force-cache' },
): Promise<Event | null> {
  const requestId = randomUUID();
  const res = await internalFetch(`/events/${id}`, {
    cache: options.cache ?? 'force-cache',
    requestId,
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw await parseApiHttpError(
      res,
      `Failed to fetch event #${id} (${res.status})`,
      requestId,
    );
  }

  const json: unknown = await res.json();
  return SingleEventResponseSchema.parse(json).data;
}

const CitiesResponseSchema = z.object({
  data: z.array(z.string()),
});

export async function fetchCities(): Promise<string[]> {
  const [clientIp, rateLimitCounted, requestId] = await Promise.all([
    getClientIp(),
    isRateLimitAlreadyCounted(),
    getIncomingRequestId(),
  ]);
  const resolvedRequestId = requestId ?? randomUUID();
  const res = await internalFetch('/cities', {
    cache: 'no-store',
    clientIp,
    rateLimitCounted,
    requestId: resolvedRequestId,
  });

  if (!res.ok) {
    throw await parseApiHttpError(
      res,
      `Failed to fetch cities (${res.status})`,
      resolvedRequestId,
    );
  }

  const json: unknown = await res.json();
  return CitiesResponseSchema.parse(json).data;
}

const SeatsResponseSchema = z.object({
  data: SeatsInfoSchema,
});

export async function fetchEventSeats(
  id: number,
  options: { cache?: RequestCache } = { cache: 'no-store' },
): Promise<SeatsInfo> {
  const [clientIp, requestId] = await Promise.all([
    getClientIp(),
    getIncomingRequestId(),
  ]);
  const resolvedRequestId = requestId ?? randomUUID();
  const res = await internalFetch(`/events/${id}/seats`, {
    ...options,
    clientIp,
    requestId: resolvedRequestId,
  });

  if (!res.ok) {
    throw await parseApiHttpError(
      res,
      `Failed to fetch seats for event #${id} (${res.status})`,
      resolvedRequestId,
    );
  }

  const json: unknown = await res.json();
  return SeatsResponseSchema.parse(json).data;
}

export async function patchEvent(id: number, body: UpdateEventBody): Promise<Event> {
  const [clientIp, requestId] = await Promise.all([
    getClientIp(),
    getIncomingRequestId(),
  ]);
  const resolvedRequestId = requestId ?? randomUUID();
  const res = await internalFetch(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    cache: 'no-store',
    clientIp,
    requestId: resolvedRequestId,
  });

  if (!res.ok) {
    throw await parseApiHttpError(
      res,
      `Failed to update event #${id} (${res.status})`,
      resolvedRequestId,
    );
  }

  const json: unknown = await res.json();
  return SingleEventResponseSchema.parse(json).data;
}
