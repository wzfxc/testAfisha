'use client';

import { RouteErrorCard } from '@/components/route-error-card';

export default function EventDetailError({
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
      title="Не вдалося завантажити подію"
      showBackHome
    />
  );
}
