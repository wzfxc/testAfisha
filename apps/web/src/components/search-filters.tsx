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

export function SearchFilters({
  cities,
  initialCity,
  initialQuery,
  meta,
}: SearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isPendingTransition, startTransition] = useTransition();
  const [isPendingHard, setIsPendingHard] = useState(false);

  const isPending = isPendingTransition || isPendingHard;

  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const isTypingRef = useRef(false);
  const submittedQueryRef = useRef(initialQuery.trim());

  useEffect(() => {
    setIsPendingHard(false);
    const currentUrlQ = (searchParams.get('q') ?? '').trim();
    if (currentUrlQ === submittedQueryRef.current) {
      isTypingRef.current = false;
    }
  }, [searchParams]);

  useEffect(() => {
    const incoming = initialQuery.trim();
    if (!isTypingRef.current && incoming === submittedQueryRef.current) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    setCity(initialCity);
  }, [initialCity]);

  const navigateWithParams = useCallback(
    (updates: { city?: string; q?: string; page?: number }, hard = false) => {
      const currentQs = searchParams.toString();
      const params = new URLSearchParams(currentQs);

      if (updates.city !== undefined) {
        const cleanCity = updates.city.trim();
        if (cleanCity) {
          params.set('city', cleanCity);
        } else {
          params.delete('city');
        }
      }

      if (updates.q !== undefined) {
        const cleanQ = updates.q.trim();
        if (cleanQ.length > 0) {
          params.set('q', cleanQ);
        } else {
          params.delete('q');
        }
      }

      if (updates.page !== undefined) {
        if (updates.page > 1) {
          params.set('page', String(updates.page));
        } else {
          params.delete('page');
        }
      }

      const newQs = params.toString();
      const href = newQs ? `${pathname}?${newQs}` : pathname;
      const currentHref = currentQs ? `${pathname}?${currentQs}` : pathname;

      if (href === currentHref) {
        setIsPendingHard(false);
        isTypingRef.current = false;
        return;
      }

      if (hard) {
        setIsPendingHard(true);
        window.location.assign(href);
      } else {
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }
    },
    [pathname, router, searchParams],
  );

  const navRef = useRef(navigateWithParams);

  useEffect(() => {
    navRef.current = navigateWithParams;
  }, [navigateWithParams]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === submittedQueryRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      submittedQueryRef.current = trimmed;
      navRef.current({ q: trimmed, page: 1 }, false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const handleCityChange = (newCity: string) => {
    isTypingRef.current = false;
    submittedQueryRef.current = query.trim();
    setCity(newCity);
    navigateWithParams({ city: newCity, q: query, page: 1 }, true);
  };

  const handleReset = () => {
    isTypingRef.current = false;
    submittedQueryRef.current = '';
    setQuery('');
    setCity('');
    navigateWithParams({ city: '', q: '', page: 1 }, true);
  };

  const hasFilters = Boolean(city || query.trim() || searchParams.has('q'));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            value={query}
            onChange={(e) => {
              isTypingRef.current = true;
              setQuery(e.target.value);
            }}
            placeholder="Search events by title..."
            aria-label="Search events by title"
            className="pl-9 pr-10"
          />
          {isPending ? (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <Loader2
                aria-label="Loading filtered results"
                className="h-4 w-4 animate-spin text-blue-600"
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            aria-label="Filter by city"
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-0 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
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
              <X className="mr-1 h-3.5 w-3.5" />
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
              onClick={() => navigateWithParams({ page: meta.page - 1 }, true)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              <span>Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || isPending}
              onClick={() => navigateWithParams({ page: meta.page + 1 }, true)}
            >
              <span>Next</span>
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
