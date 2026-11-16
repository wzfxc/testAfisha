import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto my-16 max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <FileQuestion className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Event not found</h1>
      <p className="mt-1.5 text-sm text-slate-600">
        The event or page you are looking for does not exist or may have been removed.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to all events
        </Link>
      </div>
    </div>
  );
}

