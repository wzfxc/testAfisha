import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EventIdParamsSchema } from '@app/shared';
import { EditEventForm } from '@/components/edit-event-form';
import { fetchEventById } from '@/lib/api';

interface EditEventPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEventPage({ params }: EditEventPageProps) {
  const rawParams = await params;
  const parsed = EventIdParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    notFound();
  }

  const event = await fetchEventById(parsed.data.id);
  if (!event) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to event details</span>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Edit Event #{event.id}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Changes invalidate the backend LRU cache and revalidate all Next.js views immediately.
        </p>
      </div>

      <EditEventForm event={event} />
    </div>
  );
}

