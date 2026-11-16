export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading content">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="h-16 w-full animate-pulse rounded-lg border border-slate-200 bg-white" />

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

