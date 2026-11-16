'use client';

import { Heart } from 'lucide-react';
import { useFavorites } from '@/components/providers/favorites-provider';
import { cn } from '@/lib/utils';

export interface FavoriteButtonProps {
  eventId: number;
  showLabel?: boolean;
  className?: string;
}

export function FavoriteButton({
  eventId,
  showLabel = false,
  className,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(eventId);

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(eventId)}
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
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

