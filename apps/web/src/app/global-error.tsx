'use client';

import { useEffect } from 'react';
import { getErrorMessageFromDigest } from '@/lib/api-errors';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { message } = getErrorMessageFromDigest(error.digest);

  useEffect(() => {
    console.error('[GlobalErrorBoundary]', {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <html lang="uk" className="light" style={{ colorScheme: 'light' }}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
          <div
            role="alert"
            className="w-full rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm"
          >
            <h1 className="text-base font-semibold text-slate-900">
              Критична помилка застосунку
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{message}</p>
            {error.digest ? (
              <p className="mt-2 font-mono text-[11px] text-slate-400">
                Digest: {error.digest}
              </p>
            ) : null}
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  window.location.reload();
                }}
                className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                Спробувати ще
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}

