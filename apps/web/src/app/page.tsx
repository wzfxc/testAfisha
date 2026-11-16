import { Suspense } from 'react';
import { ListEventsQuerySchema, type ListEventsQuery } from '@app/shared';
import { EventCard } from '@/components/event-card';
import { EventsPagination, SearchFilters } from '@/components/search-filters';
import { fetchCities, fetchEvents } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading events list">
      <div className="flex items-center justify-between">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-16 animate-pulse rounded bg-slate-200" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="flex h-64 flex-col justify-between rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="space-y-3">
              <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-8 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function EventsList({ query }: { query: ListEventsQuery }) {
  const eventsResult = await fetchEvents(query, { cache: 'no-store' });

  return (
    <div className="space-y-4">
      <EventsPagination
        city={query.city ?? ''}
        q={query.q ?? ''}
        meta={eventsResult.meta}
      />

      {eventsResult.data.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <h2 className="text-base font-semibold text-slate-900">
            No matching events found
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Try clearing your search query or selecting a different city filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {eventsResult.data.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { q, city, page } = await searchParams;

  const parsed = ListEventsQuerySchema.safeParse({
    city,
    q,
    page,
    limit: 12,
  });

  const query: ListEventsQuery = parsed.success
    ? parsed.data
    : { city: undefined, q: undefined, page: 1, limit: 12 };

  const cities = await fetchCities();
  const suspenseKey = `${query.city ?? ''}:${query.q ?? ''}:${query.page}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Upcoming Events
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Browse conferences, concerts, and exhibitions across cities. Sorted chronologically.
        </p>
      </div>

      <SearchFilters
        cities={cities}
        initialCity={query.city ?? ''}
        initialQuery={query.q ?? ''}
      />

      <Suspense key={suspenseKey} fallback={<ListSkeleton />}>
        <EventsList query={query} />
      </Suspense>
    </div>
  );
}

