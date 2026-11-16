'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PaginationMeta } from '@app/shared';

export interface SearchFiltersProps {
  cities: string[];
  initialCity: string;
  initialQuery: string;
}

export interface EventsPaginationProps {
  city: string;
  q: string;
  meta: PaginationMeta;
}

const DEBOUNCE_MS = 300;

function buildHref(
  pathname: string,
  values: { city?: string; q?: string; page?: number },
): string {
  const params = new URLSearchParams();
  const cleanCity = values.city?.trim() ?? '';
  const cleanQ = values.q?.trim() ?? '';
  const targetPage = values.page ?? 1;

  if (cleanCity.length > 0) {
    params.set('city', cleanCity);
  }
  if (cleanQ.length > 0) {
    params.set('q', cleanQ);
  }
  if (targetPage > 1) {
    params.set('page', String(targetPage));
  }

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function SearchFilters({
  cities,
  initialCity,
  initialQuery,
}: SearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const lastSentQueryRef = useRef(initialQuery.trim());
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!isTypingRef.current && !isPending) {
      lastSentQueryRef.current = initialQuery.trim();
      setQuery(initialQuery);
      setCity(initialCity);
    }
  }, [initialCity, initialQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextQ = params.get('q') ?? '';
      const nextCity = params.get('city') ?? '';
      isTypingRef.current = false;
      lastSentQueryRef.current = nextQ.trim();
      setQuery(nextQ);
      setCity(nextCity);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === lastSentQueryRef.current) {
      isTypingRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      isTypingRef.current = false;
      lastSentQueryRef.current = trimmed;
      const href = buildHref(pathname, { city, q: trimmed, page: 1 });
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [city, pathname, query, router]);

  const handleCityChange = (newCity: string) => {
    isTypingRef.current = false;
    setCity(newCity);
    const trimmedQ = query.trim();
    lastSentQueryRef.current = trimmedQ;
    const href = buildHref(pathname, { city: newCity, q: trimmedQ, page: 1 });
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  const handleReset = () => {
    isTypingRef.current = false;
    lastSentQueryRef.current = '';
    setQuery('');
    setCity('');
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  const hasFilters = Boolean(city.trim() || query.trim());

  return (
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
          <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center">
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
  );
}

export function EventsPagination({ city, q, meta }: EventsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handlePageChange = (targetPage: number) => {
    const href = buildHref(pathname, { city, q, page: targetPage });
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  return (
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
            onClick={() => handlePageChange(meta.page - 1)}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            <span>Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.totalPages || isPending}
            onClick={() => handlePageChange(meta.page + 1)}
          >
            <span>Next</span>
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
