'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { EventIdParamsSchema, UpdateEventBodySchema } from '@app/shared';
import { ApiHttpError, patchEvent } from '@/lib/api';
import { formatUserError } from '@/lib/api-errors';

export interface EditFieldErrors {
  title?: string[];
  description?: string[];
}

export interface UpdateEventActionState {
  ok: boolean | null;
  message?: string;
  formError?: string;
  fieldErrors?: EditFieldErrors;
  values?: {
    title: string;
    description: string;
  };
}

export async function updateEventAction(
  eventId: number,
  _prevState: UpdateEventActionState,
  formData: FormData,
): Promise<UpdateEventActionState> {
  const rawTitle = formData.get('title');
  const rawDescription = formData.get('description');
  const title = typeof rawTitle === 'string' ? rawTitle : '';
  const description = typeof rawDescription === 'string' ? rawDescription : '';
  const values = { title, description };

  const idParsed = EventIdParamsSchema.safeParse({ id: eventId });
  if (!idParsed.success) {
    return {
      ok: false,
      formError: 'Некоректний ідентифікатор події.',
      values,
    };
  }

  const bodyParsed = UpdateEventBodySchema.safeParse({
    title,
    description,
  });

  if (!bodyParsed.success) {
    const fieldErrors: EditFieldErrors = {};
    for (const issue of bodyParsed.error.issues) {
      const field = issue.path[0];
      if (field === 'title' || field === 'description') {
        fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
      }
    }
    return {
      ok: false,
      formError:
        bodyParsed.error.issues[0]?.message ?? 'Перевірте правильність заповнення полів.',
      fieldErrors,
      values,
    };
  }

  try {
    const updated = await patchEvent(idParsed.data.id, bodyParsed.data);

    revalidatePath('/');
    revalidatePath(`/events/${idParsed.data.id}`);
    revalidatePath(`/events/${idParsed.data.id}/edit`);
    revalidatePath('/favorites');

    return {
      ok: true,
      message: 'Зміни успішно збережено.',
      values: {
        title: updated.title,
        description: updated.description,
      },
    };
  } catch (err: unknown) {
    if (err instanceof ApiHttpError && err.status === 404) {
      notFound();
    }

    if (err instanceof ApiHttpError && err.status === 400 && err.details) {
      const fieldErrors: EditFieldErrors = {};
      for (const detail of err.details) {
        if (detail.field === 'title' || detail.field === 'description') {
          fieldErrors[detail.field] = [
            ...(fieldErrors[detail.field] ?? []),
            detail.message,
          ];
        }
      }
      return {
        ok: false,
        formError: err.message,
        ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
        values,
      };
    }

    const formatted = formatUserError(err);
    return {
      ok: false,
      formError: formatted.message,
      values,
    };
  }
}
