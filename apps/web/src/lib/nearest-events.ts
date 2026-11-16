import type { Event, PaginatedEvents } from '@app/shared';

/** Number of event pages pre-rendered at build time (`generateStaticParams`). */
export const PRERENDER_EVENT_COUNT = 15;

/** Largest page size accepted by `GET /events` (`ListEventsQuerySchema.limit.max`). */
export const MAX_EVENTS_PAGE_SIZE = 50;

/**
 * Picks the `count` nearest upcoming events relative to `now` (epoch ms):
 * drops events whose date is in the past, sorts by date (then id for stability)
 * and returns at most `count` items. Fewer upcoming events → returns all of them.
 */
export function pickNearestUpcoming(events: readonly Event[], now: number, count: number): Event[] {
  return events
    .filter((event) => Date.parse(event.date) >= now)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id)
    .slice(0, Math.max(0, count));
}

/**
 * Walks `GET /events` pages (sorted by date ascending on the API side) and returns
 * the nearest upcoming events. Stops as soon as `count` upcoming events are collected
 * or the last page is reached, so the API does not need a date filter.
 */
export async function collectNearestUpcoming(
  fetchPage: (page: number, limit: number) => Promise<PaginatedEvents>,
  now: number,
  count: number = PRERENDER_EVENT_COUNT,
  pageSize: number = MAX_EVENTS_PAGE_SIZE,
): Promise<Event[]> {
  const collected: Event[] = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await fetchPage(page, pageSize);
    collected.push(...data);
    const upcoming = pickNearestUpcoming(collected, now, count);
    if (upcoming.length >= count || page >= meta.totalPages || data.length === 0) {
      return upcoming;
    }
  }
}
