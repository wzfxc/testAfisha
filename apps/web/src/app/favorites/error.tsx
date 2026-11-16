'use client';

import { RouteErrorCard } from '@/components/route-error-card';

export default function FavoritesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorCard
      error={error}
      reset={reset}
      title="Unable to load favorites"
      showBackHome
    />
  );
}

