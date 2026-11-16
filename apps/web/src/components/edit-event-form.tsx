'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_DESCRIPTION_MIN,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  type Event,
} from '@app/shared';
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
  ok: null,
};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <Button type="submit" variant="primary" disabled={isDisabled}>
      {pending ? (
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
  );
}

export function EditEventForm({ event }: EditEventFormProps) {
  const boundAction = updateEventAction.bind(null, event.id);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);

  const hasTitleError = Boolean(state.fieldErrors?.title?.length);
  const hasDescriptionError = Boolean(state.fieldErrors?.description?.length);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (isPending) {
          e.preventDefault();
        }
      }}
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      {state.ok === true && state.message ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{state.message}</span>
        </div>
      ) : null}

      {state.ok === false && state.formError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{state.formError}</span>
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={EVENT_TITLE_MIN}
          maxLength={EVENT_TITLE_MAX}
          readOnly={isPending}
          aria-invalid={hasTitleError || undefined}
          aria-describedby={hasTitleError ? 'title-error' : undefined}
        />
        <div className="flex items-start justify-between gap-2 text-xs">
          {state.fieldErrors?.title ? (
            <p id="title-error" className="text-red-600">
              {state.fieldErrors.title[0]}
            </p>
          ) : (
            <span className="text-slate-400">
              Min {EVENT_TITLE_MIN} characters
            </span>
          )}
          <span
            className={
              title.trim().length > EVENT_TITLE_MAX ||
              (title.trim().length > 0 && title.trim().length < EVENT_TITLE_MIN)
                ? 'shrink-0 text-red-600'
                : 'shrink-0 text-slate-400'
            }
          >
            {title.length} / {EVENT_TITLE_MAX}
          </span>
        </div>
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={EVENT_DESCRIPTION_MIN}
          maxLength={EVENT_DESCRIPTION_MAX}
          readOnly={isPending}
          aria-invalid={hasDescriptionError || undefined}
          aria-describedby={hasDescriptionError ? 'description-error' : undefined}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 aria-[invalid=true]:border-red-500"
        />
        <div className="flex items-start justify-between gap-2 text-xs">
          {state.fieldErrors?.description ? (
            <p id="description-error" className="text-red-600">
              {state.fieldErrors.description[0]}
            </p>
          ) : (
            <span className="text-slate-400">
              Min {EVENT_DESCRIPTION_MIN} characters
            </span>
          )}
          <span
            className={
              description.trim().length > EVENT_DESCRIPTION_MAX ||
              (description.trim().length > 0 &&
                description.trim().length < EVENT_DESCRIPTION_MIN)
                ? 'shrink-0 text-red-600'
                : 'shrink-0 text-slate-400'
            }
          >
            {description.length} / {EVENT_DESCRIPTION_MAX}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>

        <SubmitButton disabled={isPending} />
      </div>
    </form>
  );
}
