import { Suspense } from 'react';
import Link from 'next/link';
import type { Event } from '@app/shared';
import { FavoritesList } from '@/components/favorites-list';
import { InlineApiError } from '@/components/inline-api-error';
import { fetchEventById } from '@/lib/api';
import { formatUserError } from '@/lib/api-errors';
import { getFavoriteIdsFromCookie } from '@/lib/favorites-cookie';

export const dynamic = 'force-dynamic';

function FavoritesSkeleton() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading favorites"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="flex h-64 flex-col justify-between rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="space-y-3">
            <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
            <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-8 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

async function FavoritesContent() {
  const favoriteIds = await getFavoriteIdsFromCookie();

  try {
    const eventsOrNull = await Promise.all(
      favoriteIds.map((id) => fetchEventById(id)),
    );

    const favoriteEvents = eventsOrNull
      .filter((event): event is Event => event !== null)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    return <FavoritesList initialEvents={favoriteEvents} />;
  } catch (err: unknown) {
    const formatted = formatUserError(err);
    return <InlineApiError message={formatted.message} digest={formatted.digest} />;
  }
}

export default function FavoritesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Saved Favorites
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Stored securely in your session&apos;s HTTP-only cookie.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          &larr; Browse all events
        </Link>
      </div>

      <Suspense fallback={<FavoritesSkeleton />}>
        <FavoritesContent />
      </Suspense>
    </div>
  );
}
