import { Suspense } from 'react';
import { ListEventsQuerySchema } from '@app/shared';
import { EventCard } from '@/components/event-card';
import { SearchFilters } from '@/components/search-filters';
import { fetchCities, fetchEvents } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { q, city, page } = await searchParams;

  const parsed = ListEventsQuerySchema.safeParse({
    city,
    q,
    page,
    limit: 12,
  });

  const query = parsed.success
    ? parsed.data
    : { city: undefined, q: undefined, page: 1, limit: 12 };

  const [eventsResult, cities] = await Promise.all([
    fetchEvents(query, { cache: 'no-store' }),
    fetchCities(),
  ]);

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

      <Suspense
        fallback={
          <div className="h-16 w-full animate-pulse rounded-lg border border-slate-200 bg-white" />
        }
      >
        <SearchFilters
          cities={cities}
          initialCity={query.city ?? ''}
          initialQuery={query.q ?? ''}
          meta={eventsResult.meta}
        />
      </Suspense>

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
