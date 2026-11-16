'use server';

import { revalidatePath } from 'next/cache';
import { EventIdParamsSchema, UpdateEventBodySchema } from '@app/shared';
import { ApiHttpError, patchEvent } from '@/lib/api';

export interface UpdateEventActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: {
    title?: string[];
    description?: string[];
  };
}

export async function updateEventAction(
  eventId: number,
  _prevState: UpdateEventActionState,
  formData: FormData,
): Promise<UpdateEventActionState> {
  const idParsed = EventIdParamsSchema.safeParse({ id: eventId });
  if (!idParsed.success) {
    return { status: 'error', message: 'Invalid event ID.' };
  }

  const rawTitle = formData.get('title');
  const rawDescription = formData.get('description');

  const bodyParsed = UpdateEventBodySchema.safeParse({
    title: typeof rawTitle === 'string' ? rawTitle : undefined,
    description: typeof rawDescription === 'string' ? rawDescription : undefined,
  });

  if (!bodyParsed.success) {
    const fieldErrors: { title?: string[]; description?: string[] } = {};
    for (const issue of bodyParsed.error.issues) {
      const field = issue.path[0];
      if (field === 'title' || field === 'description') {
        fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
      }
    }
    return {
      status: 'error',
      message: bodyParsed.error.issues[0]?.message ?? 'Please check the form fields.',
      fieldErrors,
    };
  }

  try {
    await patchEvent(idParsed.data.id, bodyParsed.data);

    // Instantly invalidate cached RSC payloads across Home, Event Details, Edit, and Favorites
    revalidatePath('/');
    revalidatePath(`/events/${idParsed.data.id}`);
    revalidatePath(`/events/${idParsed.data.id}/edit`);
    revalidatePath('/favorites');

    return {
      status: 'success',
      message: 'Event details updated successfully.',
    };
  } catch (err: unknown) {
    if (err instanceof ApiHttpError) {
      return { status: 'error', message: err.message };
    }
    return {
      status: 'error',
      message: 'Unexpected error while saving event changes.',
    };
  }
}

