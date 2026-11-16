import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Pencil, Users } from 'lucide-react';
import { EventIdParamsSchema } from '@app/shared';
import { FavoriteButton } from '@/components/favorite-button';
import { SeatsSection, SeatsSectionSkeleton } from '@/components/seats-section';
import { Badge } from '@/components/ui/badge';
import { fetchEventById, fetchEvents } from '@/lib/api';
import { formatEventDate } from '@/lib/utils';

/**
 * Pre-renders the 15 nearest events at build time by querying the API server.
 * Since `GET /events` returns events sorted ascending by `date`,
 * `page=1&limit=15` yields the 15 nearest upcoming events.
 */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const nearest = await fetchEvents({ page: 1, limit: 15 });
  return nearest.data.map((event) => ({ id: String(event.id) }));
}

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const rawParams = await params;
  const parsed = EventIdParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    notFound();
  }

  const event = await fetchEventById(parsed.data.id);
  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to events</span>
        </Link>

        <div className="flex items-center gap-2">
          <FavoriteButton eventId={event.id} showLabel />
          <Link
            href={`/events/${event.id}/edit`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit Event</span>
          </Link>
        </div>
      </div>

      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{event.city}</Badge>
          <span className="text-xs text-slate-400">Event #{event.id}</span>
        </div>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {event.title}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          {event.description}
        </p>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
          <div className="flex items-start gap-2.5">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-slate-500">Date &amp; Time</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {formatEventDate(event.date)}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-slate-500">Venue</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {event.venue}, {event.city}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-slate-500">Total Capacity</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {event.capacity.toLocaleString()} seats
              </dd>
            </div>
          </div>
        </dl>
      </article>

      <Suspense fallback={<SeatsSectionSkeleton />}>
        <SeatsSection eventId={event.id} capacity={event.capacity} />
      </Suspense>
    </div>
  );
}
