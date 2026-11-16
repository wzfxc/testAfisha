import Link from 'next/link';
import { Heart } from 'lucide-react';
import type { Event } from '@app/shared';
import { EventCard } from '@/components/event-card';
import { fetchEventById } from '@/lib/api';
import { getFavoriteIdsFromCookie } from '@/lib/favorites-cookie';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const favoriteIds = await getFavoriteIdsFromCookie();

  const eventsOrNull = await Promise.all(
    favoriteIds.map((id) => fetchEventById(id).catch(() => null)),
  );

  const favoriteEvents = eventsOrNull
    .filter((event): event is Event => event !== null)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

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

      {favoriteEvents.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Heart className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            No favorite events yet
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Click the heart icon on any event card to bookmark it here.
          </p>
          <div className="mt-5">
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              Explore events
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

