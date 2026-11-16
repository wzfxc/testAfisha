'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getFriendlyErrorMessage(rawMessage: string | undefined): string {
  if (!rawMessage || rawMessage.includes('Server Components render')) {
    return 'Could not load event details right now. Please wait a moment and retry.';
  }
  return rawMessage;
}

export default function EventDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto my-12 max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">
        Could not load event details
      </h2>
      <p className="mt-1.5 text-sm text-slate-600">
        {getFriendlyErrorMessage(error.message)}
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button variant="primary" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to events
        </Link>
      </div>
    </div>
  );
}
