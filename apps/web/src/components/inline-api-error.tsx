'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface InlineApiErrorProps {
  message: string;
  digest?: string;
}

export function InlineApiError({ message, digest }: InlineApiErrorProps) {
  const router = useRouter();
  const [isRetrying, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm"
    >
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">
        Не вдалося завантажити дані
      </h2>
      <p className="mt-1.5 text-sm text-slate-600">{message}</p>
      {digest ? (
        <p className="mt-2 font-mono text-[11px] text-slate-400">
          Digest: {digest}
        </p>
      ) : null}
      <div className="mt-5 flex justify-center">
        <Button variant="primary" onClick={handleRetry} disabled={isRetrying}>
          <RotateCcw className="h-4 w-4" />
          <span>Спробувати ще</span>
        </Button>
      </div>
    </div>
  );
}

