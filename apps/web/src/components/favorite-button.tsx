'use client';

import { Heart } from 'lucide-react';
import { useFavorites } from '@/components/providers/favorites-provider';
import { cn } from '@/lib/utils';

export interface FavoriteButtonProps {
  eventId: number;
  showLabel?: boolean;
  initialFavorite?: boolean;
  className?: string;
}

export function FavoriteButton({
  eventId,
  showLabel = false,
  initialFavorite,
  className,
}: FavoriteButtonProps) {
  const { status, isFavorite, toggleFavorite } = useFavorites();

  if (status === 'loading' && initialFavorite === undefined) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        aria-label="Loading favorite status"
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-400',
          className,
        )}
      >
        <span className="h-4 w-4 animate-pulse rounded-sm bg-slate-200" />
        {showLabel ? (
          <span className="h-3.5 w-11 animate-pulse rounded bg-slate-200" />
        ) : null}
      </button>
    );
  }

  if (status === 'error' && initialFavorite === undefined) {
    return (
      <button
        type="button"
        disabled
        aria-label="Favorites unavailable"
        title="Could not load favorite status"
        className={cn(
          'inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-400',
          className,
        )}
      >
        <Heart className="h-4 w-4 text-slate-300" />
        {showLabel ? <span>Favorite</span> : null}
      </button>
    );
  }

  const active =
    status === 'loading' ? Boolean(initialFavorite) : isFavorite(eventId);

  return (
    <button
      type="button"
      disabled={status !== 'ready'}
      onClick={() => toggleFavorite(eventId)}
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-wait',
        active
          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        className,
      )}
    >
      <Heart
        className={cn(
          'h-4 w-4',
          active ? 'fill-red-500 text-red-500' : 'text-slate-500',
        )}
      />
      {showLabel ? <span>{active ? 'Saved' : 'Favorite'}</span> : null}
    </button>
  );
}
