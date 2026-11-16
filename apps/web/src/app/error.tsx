'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getFriendlyErrorMessage(rawMessage: string | undefined): string {
  if (!rawMessage || rawMessage.includes('Server Components render')) {
    return 'The service is temporarily unavailable or rate limit was exceeded. Please wait a moment and try again.';
  }
  return rawMessage;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RootErrorBoundary]', error);
  }, [error]);

  return (
    <div className="mx-auto my-12 max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">
        Unable to load this view
      </h2>
      <p className="mt-1.5 text-sm text-slate-600">
        {getFriendlyErrorMessage(error.message)}
      </p>
      <div className="mt-5 flex justify-center">
        <Button variant="primary" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          <span>Try again</span>
        </Button>
      </div>
    </div>
  );
}
