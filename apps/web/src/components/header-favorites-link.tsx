'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/components/providers/favorites-provider';

export function HeaderFavoritesLink() {
  const { favoritesCount } = useFavorites();

  return (
    <Link
      href="/favorites"
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <Heart
        className={
          favoritesCount > 0
            ? 'h-4 w-4 fill-red-500 text-red-500'
            : 'h-4 w-4 text-slate-500'
        }
      />
      <span>Favorites</span>
      <span
        aria-label={`${favoritesCount} favorite events`}
        className="inline-flex min-w-5 items-center justify-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-800"
      >
        {favoritesCount}
      </span>
    </Link>
  );
}

