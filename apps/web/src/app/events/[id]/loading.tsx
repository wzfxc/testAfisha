import { SeatsSectionSkeleton } from '@/components/seats-section';

export default function EventDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-7 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <SeatsSectionSkeleton />
    </div>
  );
}

