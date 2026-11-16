import type { SeatsInfo } from '@app/shared';
import { SeatsPoller } from '@/components/seats-poller';
import { fetchEventSeats } from '@/lib/api';

export interface SeatsSectionProps {
  eventId: number;
  capacity: number;
}

/**
 * Isolated async Server Component wrapped in `<Suspense>` on `/events/[id]`.
 * Catches upstream errors locally so a failure in `/events/:id/seats` NEVER
 * crashes the rest of the Event Detail page.
 */
export async function SeatsSection({ eventId, capacity }: SeatsSectionProps) {
  let initialSeats: SeatsInfo | null = null;
  let initialError: string | null = null;

  try {
    initialSeats = await fetchEventSeats(eventId);
  } catch (err: unknown) {
    initialError =
      err instanceof Error
        ? err.message
        : 'Live seat telemetry is temporarily unavailable.';
  }

  return (
    <SeatsPoller
      eventId={eventId}
      capacity={capacity}
      initialSeats={initialSeats}
      initialError={initialError}
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

