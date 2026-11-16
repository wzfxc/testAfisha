'use client';

import { useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessageFromDigest } from '@/lib/api-errors';

export interface RouteErrorCardProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  showBackHome?: boolean;
}

export function RouteErrorCard({
  error,
  reset,
  title = 'Unable to load page',
  showBackHome = false,
}: RouteErrorCardProps) {
  const router = useRouter();
  const [isRetrying, startTransition] = useTransition();
  const { message } = getErrorMessageFromDigest(error.digest);

  useEffect(() => {
    console.error('[RouteErrorBoundary]', {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  const handleRetry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div
      role="alert"
      className="mx-auto my-12 max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm"
    >
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 text-sm text-slate-600">{message}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-slate-400">
          Digest: {error.digest}
        </p>
      ) : null}
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button variant="primary" onClick={handleRetry} disabled={isRetrying}>
          <RotateCcw className="h-4 w-4" />
          <span>Try again</span>
        </Button>
        {showBackHome ? (
          <Link
            href="/"
            prefetch={false}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to events
          </Link>
        ) : null}
      </div>
    </div>
  );
}
