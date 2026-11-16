'use client';

import { RouteErrorCard } from '@/components/route-error-card';

export default function EditEventError({
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
      title="Unable to load event editor"
      showBackHome
    />
  );
}

