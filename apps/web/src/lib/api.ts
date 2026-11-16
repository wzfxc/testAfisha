import 'server-only';
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

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:4000';

function getInternalSecret(): string | undefined {
  const secret = process.env.INTERNAL_SECRET?.trim() || undefined;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('INTERNAL_SECRET environment variable is required in production');
  }
  return secret;
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

async function isRateLimitAlreadyCounted(): Promise<boolean> {
  try {
    const hdrs = await headers();
    return hdrs.get('x-rate-limit-counted') === '1';
  } catch {
    return false;
  }
}

export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

interface InternalFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  clientIp?: string | undefined;
  rateLimitCounted?: boolean | undefined;
}

async function internalFetch(path: string, options: InternalFetchOptions = {}): Promise<Response> {
  const secret = getInternalSecret();
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const { clientIp, rateLimitCounted, headers: customHeaders, ...rest } = options;

  return fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(secret ? { 'x-internal-secret': secret } : {}),
      ...(clientIp ? { 'x-client-ip': clientIp } : {}),
      ...(rateLimitCounted ? { 'x-rate-limit-counted': '1' } : {}),
      ...customHeaders,
    },
  });
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
  const [clientIp, rateLimitCounted] = shouldIncludeIp
    ? await Promise.all([getClientIp(), isRateLimitAlreadyCounted()])
    : [undefined, false];

  const qs = search.toString();
  const res = await internalFetch(`/events${qs ? `?${qs}` : ''}`, {
    cache: cacheMode,
    clientIp,
    rateLimitCounted,
  });

  if (!res.ok) {
    throw new ApiHttpError(res.status, `Failed to fetch events (${res.status})`);
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
  const res = await internalFetch(`/events/${id}`, {
    cache: options.cache ?? 'force-cache',
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new ApiHttpError(res.status, `Failed to fetch event #${id} (${res.status})`);
  }

  const json: unknown = await res.json();
  return SingleEventResponseSchema.parse(json).data;
}

const CitiesResponseSchema = z.object({
  data: z.array(z.string()),
});

export async function fetchCities(): Promise<string[]> {
  const [clientIp, rateLimitCounted] = await Promise.all([
    getClientIp(),
    isRateLimitAlreadyCounted(),
  ]);
  const res = await internalFetch('/cities', {
    cache: 'no-store',
    clientIp,
    rateLimitCounted,
  });

  if (!res.ok) {
    throw new ApiHttpError(res.status, `Failed to fetch cities (${res.status})`);
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
  const clientIp = await getClientIp();
  const res = await internalFetch(`/events/${id}/seats`, {
    ...options,
    clientIp,
  });

  if (!res.ok) {
    throw new ApiHttpError(res.status, `Failed to fetch seats for event #${id} (${res.status})`);
  }

  const json: unknown = await res.json();
  return SeatsResponseSchema.parse(json).data;
}

export async function patchEvent(id: number, body: UpdateEventBody): Promise<Event> {
  const clientIp = await getClientIp();
  const res = await internalFetch(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    cache: 'no-store',
    clientIp,
  });

  if (!res.ok) {
    const errBody: unknown = await res.json().catch(() => null);
    const message =
      typeof errBody === 'object' &&
      errBody !== null &&
      'error' in errBody &&
      typeof errBody.error === 'object' &&
      errBody.error !== null &&
      'message' in errBody.error &&
      typeof errBody.error.message === 'string'
        ? errBody.error.message
        : `Failed to update event #${id} (${res.status})`;
    throw new ApiHttpError(res.status, message);
  }

  const json: unknown = await res.json();
  return SingleEventResponseSchema.parse(json).data;
}
