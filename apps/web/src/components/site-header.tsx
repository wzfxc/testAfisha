import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { HeaderFavoritesLink } from '@/components/header-favorites-link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900"
          >
            <CalendarDays className="h-5 w-5 text-blue-600" />
            <span>Afisha Events</span>
          </Link>

          <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 sm:flex">
            <Link
              href="/"
              className="rounded px-2 py-1 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              All Events
            </Link>
          </nav>
        </div>

        <HeaderFavoritesLink />
      </div>
    </header>
  );
}

