import 'server-only';
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
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'super-secret-internal-ssr-key';

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
}

/**
 * Server-only fetch wrapper.
 * Automatically attaches `x-internal-secret` so Next.js SSR / SSG / Server Actions
 * bypass the Express IP rate limiter, and keeps `API_URL` strictly out of the client bundle.
 */
async function internalFetch(path: string, options: InternalFetchOptions = {}): Promise<Response> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  return fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(INTERNAL_SECRET ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
      ...options.headers,
    },
  });
}

export interface FetchEventsParams {
  city?: string | undefined;
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export async function fetchEvents(params: FetchEventsParams = {}): Promise<PaginatedEvents> {
  const search = new URLSearchParams();
  if (params.city) search.set('city', params.city);
  if (params.q) search.set('q', params.q);
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));

  const qs = search.toString();
  const res = await internalFetch(`/events${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
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

export async function fetchEventById(id: number): Promise<Event | null> {
  const res = await internalFetch(`/events/${id}`, {
    cache: 'no-store',
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
  const res = await internalFetch('/cities', {
    cache: 'no-store',
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

export async function fetchEventSeats(id: number): Promise<SeatsInfo> {
  const res = await internalFetch(`/events/${id}/seats`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ApiHttpError(res.status, `Failed to fetch seats for event #${id} (${res.status})`);
  }

  const json: unknown = await res.json();
  return SeatsResponseSchema.parse(json).data;
}

export async function patchEvent(id: number, body: UpdateEventBody): Promise<Event> {
  const res = await internalFetch(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    cache: 'no-store',
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

