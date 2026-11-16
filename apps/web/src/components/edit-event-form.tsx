'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import type { Event } from '@app/shared';
import {
  updateEventAction,
  type UpdateEventActionState,
} from '@/app/actions/events';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditEventFormProps {
  event: Event;
}

const initialState: UpdateEventActionState = {
  status: 'idle',
};

export function EditEventForm({ event }: EditEventFormProps) {
  const boundAction = updateEventAction.bind(null, event.id);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      {state.status === 'success' ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{state.message}</span>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="title"
          className="block text-sm font-medium text-slate-800"
        >
          Event Title
        </label>
        <Input
          id="title"
          name="title"
          defaultValue={event.title}
          required
          maxLength={200}
          disabled={isPending}
        />
        {state.fieldErrors?.title ? (
          <p className="text-xs text-red-600">{state.fieldErrors.title[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-slate-800"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={event.description}
          required
          maxLength={5000}
          disabled={isPending}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
        />
        {state.fieldErrors?.description ? (
          <p className="text-xs text-red-600">
            {state.fieldErrors.description[0]}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>

        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

