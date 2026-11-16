'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PaginationMeta } from '@app/shared';

export interface SearchFiltersProps {
  cities: string[];
  initialCity: string;
  initialQuery: string;
  meta: PaginationMeta;
}

const DEBOUNCE_MS = 300;

/**
 * URL-driven filter bar + pagination.
 *
 * Race condition protection:
 * - Debounces `q` input by 300ms and cancels pending timers whenever a newer
 *   keystroke or filter selection occurs.
 * - Uses a monotonically increasing `navigationSeqRef` combined with React 19's
 *   `useTransition` (`router.replace`), which automatically aborts in-flight RSC
 *   fetches when superseded by a newer navigation.
 */
export function SearchFilters({
  cities,
  initialCity,
  initialQuery,
  meta,
}: SearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const navigationSeqRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local controlled state if user navigates via browser back/forward
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setCity(initialCity);
  }, [initialCity]);

  const navigateWithParams = useCallback(
    (next: { city?: string; q?: string; page?: number }) => {
      const seq = ++navigationSeqRef.current;
      const params = new URLSearchParams(searchParams.toString());

      const targetCity = next.city !== undefined ? next.city : city;
      const targetQuery = next.q !== undefined ? next.q.trim() : query.trim();
      const targetPage = next.page ?? 1;

      if (targetCity) {
        params.set('city', targetCity);
      } else {
        params.delete('city');
      }

      if (targetQuery) {
        params.set('q', targetQuery);
      } else {
        params.delete('q');
      }

      if (targetPage > 1) {
        params.set('page', String(targetPage));
      } else {
        params.delete('page');
      }

      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;

      startTransition(() => {
        if (navigationSeqRef.current === seq) {
          router.replace(href, { scroll: false });
        }
      });
    },
    [city, pathname, query, router, searchParams],
  );

  // Debounced search effect for `query`
  useEffect(() => {
    if (query.trim() === initialQuery.trim()) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      navigateWithParams({ q: query, page: 1 });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, initialQuery, navigateWithParams]);

  const handleCityChange = (nextCity: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setCity(nextCity);
    navigateWithParams({ city: nextCity, q: query, page: 1 });
  };

  const handleReset = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setQuery('');
    setCity('');
    navigateWithParams({ city: '', q: '', page: 1 });
  };

  const hasFilters = Boolean(city || query.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events by title..."
            aria-label="Search events by title"
            className="pl-9 pr-8"
          />
          {isPending ? (
            <Loader2
              aria-label="Loading filtered results"
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            aria-label="Filter by city"
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <Button variant="outline" size="md" onClick={handleReset}>
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          Showing page <span className="font-semibold text-slate-900">{meta.page}</span> of{' '}
          <span className="font-semibold text-slate-900">{Math.max(1, meta.totalPages)}</span>{' '}
          ({meta.total} {meta.total === 1 ? 'event' : 'events'} total)
        </div>

        {meta.totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || isPending}
              onClick={() => navigateWithParams({ page: meta.page - 1 })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || isPending}
              onClick={() => navigateWithParams({ page: meta.page + 1 })}
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

