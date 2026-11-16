'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, RefreshCw, Ticket } from 'lucide-react';
import type { SeatsInfo } from '@app/shared';
import type { SeatHistoryPoint } from '@/components/seats-fill-chart';
import { Badge } from '@/components/ui/badge';
import { parseRetryAfterHeader } from '@/lib/api-errors';

const SeatsFillChart = dynamic(() => import('@/components/seats-fill-chart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded border border-slate-100 bg-slate-50 text-xs text-slate-500">
      Loading seat-fill chart...
    </div>
  ),
});

export interface SeatsPollerProps {
  eventId: number;
  capacity: number;
  initialSeats: SeatsInfo | null;
  initialError?: string | null;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const CLIENT_POLL_TIMEOUT_MS = 5_000;
const MAX_HISTORY_POINTS = 12;

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toHistoryPoint(seats: SeatsInfo, timestamp: Date): SeatHistoryPoint {
  const occupiedSeats = Math.max(0, seats.capacity - seats.availableSeats);
  const fillRatePct =
    seats.capacity > 0 ? Math.round((occupiedSeats / seats.capacity) * 100) : 0;

  return {
    timeLabel: formatTimeLabel(timestamp),
    occupiedSeats,
    availableSeats: seats.availableSeats,
    fillRatePct,
  };
}

export function SeatsPoller({
  eventId,
  capacity,
  initialSeats,
  initialError = null,
}: SeatsPollerProps) {
  const [currentSeats, setCurrentSeats] = useState<SeatsInfo | null>(
    initialSeats,
  );
  const [history, setHistory] = useState<SeatHistoryPoint[]>(() =>
    initialSeats ? [toHistoryPoint(initialSeats, new Date())] : [],
  );
  const [pollError, setPollError] = useState<string | null>(initialError);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;
    let consecutiveFailures = 0;

    const pollOnceThenScheduleNext = async () => {
      if (isCancelled) {
        return;
      }

      activeController = new AbortController();
      const timeoutSignal = AbortSignal.timeout(CLIENT_POLL_TIMEOUT_MS);
      const signal = AbortSignal.any([activeController.signal, timeoutSignal]);
      setIsFetching(true);

      let nextDelayMs = POLL_INTERVAL_MS;

      try {
        const res = await fetch(`/api/events/${eventId}/seats`, {
          cache: 'no-store',
          signal,
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: { retryAfter?: number };
          } | null;

          if (res.status === 429) {
            const retrySeconds =
              parseRetryAfterHeader(res.headers.get('retry-after')) ??
              payload?.error?.retryAfter ??
              60;
            nextDelayMs = Math.max(POLL_INTERVAL_MS, retrySeconds * 1000);
            throw new Error(`Too many requests. Please try again in ${retrySeconds}s.`);
          }

          consecutiveFailures += 1;
          nextDelayMs = Math.min(
            MAX_BACKOFF_MS,
            POLL_INTERVAL_MS * 2 ** consecutiveFailures,
          );
          throw new Error('Service temporarily unavailable');
        }

        const payload = (await res.json()) as { data: SeatsInfo };
        if (!isCancelled) {
          consecutiveFailures = 0;
          nextDelayMs = POLL_INTERVAL_MS;
          const snapshot = payload.data;
          setCurrentSeats(snapshot);
          setPollError(null);
          setHistory((prev) => [
            ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
            toHistoryPoint(snapshot, new Date()),
          ]);
        }
      } catch (err: unknown) {
        if (activeController.signal.aborted) {
          return;
        }
        if (err instanceof DOMException && err.name === 'TimeoutError') {
          consecutiveFailures += 1;
          nextDelayMs = Math.min(
            MAX_BACKOFF_MS,
            POLL_INTERVAL_MS * 2 ** consecutiveFailures,
          );
        } else if (!(err instanceof Error && err.message.startsWith('Too many requests'))) {
          consecutiveFailures += 1;
          nextDelayMs = Math.min(
            MAX_BACKOFF_MS,
            POLL_INTERVAL_MS * 2 ** consecutiveFailures,
          );
        }

        if (!isCancelled) {
          setPollError(
            err instanceof Error
              ? err.message
              : 'Service temporarily unavailable',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsFetching(false);
          timeoutId = setTimeout(pollOnceThenScheduleNext, nextDelayMs);
        }
      }
    };

    timeoutId = setTimeout(
      pollOnceThenScheduleNext,
      initialSeats ? POLL_INTERVAL_MS : 0,
    );

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (activeController) {
        activeController.abort();
      }
    };
  }, [eventId, initialSeats]);

  const available = currentSeats?.availableSeats ?? null;
  const occupied =
    available !== null ? Math.max(0, capacity - available) : null;
  const fillPercent =
    occupied !== null && capacity > 0
      ? Math.round((occupied / capacity) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Live Seat Availability
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw
            className={
              isFetching
                ? 'h-3.5 w-3.5 animate-spin text-blue-600'
                : 'h-3.5 w-3.5 text-slate-400'
            }
          />
          <span>Updates every 5s after completion</span>
        </div>
      </div>

      {pollError ? (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{pollError}</span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Available Seats</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {available !== null ? available.toLocaleString() : '—'}
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Booked Seats</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {occupied !== null ? occupied.toLocaleString() : '—'}
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Venue Fill Rate</p>
            <Badge
              variant={
                fillPercent >= 85
                  ? 'warning'
                  : fillPercent >= 50
                    ? 'default'
                    : 'success'
              }
            >
              {fillPercent}% full
            </Badge>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Booked Seats Over Time (Live Samples)
          </h3>
          <span className="text-xs text-slate-400">
            Capacity: {capacity.toLocaleString()}
          </span>
        </div>
        <SeatsFillChart history={history} capacity={capacity} />
      </div>
    </div>
  );
}
