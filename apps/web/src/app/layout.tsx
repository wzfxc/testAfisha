import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { FavoritesProvider } from '@/components/providers/favorites-provider';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Afisha Events Platform',
  description: 'Discover upcoming concerts, conferences, and cultural events.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="light" style={{ colorScheme: 'light' }}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <FavoritesProvider initialFavoriteIds={[]}>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
              {children}
            </main>
            <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
              Afisha Event Management Platform &middot; Built with Next.js 15 &amp; React 19
            </footer>
          </div>
        </FavoritesProvider>
      </body>
    </html>
  );
}
