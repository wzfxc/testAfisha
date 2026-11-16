import Link from 'next/link';
import type { Event } from '@app/shared';
import { FavoritesList } from '@/components/favorites-list';
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

      <FavoritesList initialEvents={favoriteEvents} />
    </div>
  );
}
