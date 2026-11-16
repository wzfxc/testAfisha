'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import type { Event } from '@app/shared';
import { EventCard } from '@/components/event-card';
import { useFavorites } from '@/components/providers/favorites-provider';

export interface FavoritesListProps {
  initialEvents: Event[];
}

export function FavoritesList({ initialEvents }: FavoritesListProps) {
  const { isFavorite, favoriteIds } = useFavorites();

  // Keep only events that are currently marked as favorite in optimistic state
  const visibleEvents =
    favoriteIds.length === 0 && initialEvents.length > 0
      ? initialEvents.filter((e) => isFavorite(e.id))
      : initialEvents.filter((e) => isFavorite(e.id));

  useEffect(() => {
    // No-op: ensures reactivity with optimistic favoriteIds
  }, [favoriteIds]);

  if (visibleEvents.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {visibleEvents.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

