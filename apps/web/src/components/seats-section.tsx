import { SeatsPoller } from '@/components/seats-poller';

export interface SeatsSectionProps {
  eventId: number;
  capacity: number;
}

/**
 * Isolated Seats section wrapped in `<Suspense>` on `/events/[id]`.
 *
 * Notice how `SeatsPoller` immediately fetches `/api/events/:id/seats` on the
 * client (and then every 5 seconds after each response completes):
 * - `/events/:id/seats` is NEVER cached at build time or across users.
 * - Pre-rendering the 15 nearest `/events/[id]` pages at build time via
 *   `generateStaticParams` succeeds without triggering Next.js `no-store` bailout.
 * - A 500 error from `/events/:id/seats` is contained inside `SeatsPoller`
 *   and never crashes the event detail page.
 */
export async function SeatsSection({ eventId, capacity }: SeatsSectionProps) {
  return (
    <SeatsPoller
      eventId={eventId}
      capacity={capacity}
      initialSeats={null}
      initialError={null}
    />
  );
}

export function SeatsSectionSkeleton() {
  return (
    <div
      aria-busy="true"
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="h-20 animate-pulse rounded-md bg-slate-100" />
        <div className="h-20 animate-pulse rounded-md bg-slate-100" />
        <div className="h-20 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="mt-6 h-56 animate-pulse rounded-md bg-slate-100" />
    </div>
  );
}
