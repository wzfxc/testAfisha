'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  getFavoriteIdsFromCookie,
  setFavoriteIdsInCookie,
} from '@/lib/favorites-cookie';

const SetFavoriteInputSchema = z.object({
  eventId: z.number().int().positive(),
  isFavorite: z.boolean(),
});

export type SetFavoriteResult =
  | { ok: true; favoriteIds: number[] }
  | { ok: false; error: string };

/**
 * Idempotent Server Action that sets whether `eventId` is present in the
 * user's HTTP-only favorites cookie. Using an explicit target boolean (`isFavorite`)
 * instead of a blind server-side toggle prevents out-of-order desynchronization
 * during rapid consecutive clicks.
 */
export async function setFavoriteAction(input: {
  eventId: number;
  isFavorite: boolean;
}): Promise<SetFavoriteResult> {
  const parsed = SetFavoriteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid event ID provided.' };
  }

  const { eventId, isFavorite } = parsed.data;

  try {
    const current = await getFavoriteIdsFromCookie();
    const set = new Set(current);

    if (isFavorite) {
      set.add(eventId);
    } else {
      set.delete(eventId);
    }

    const updated = await setFavoriteIdsInCookie([...set]);
    revalidatePath('/favorites');

    return { ok: true, favoriteIds: updated };
  } catch {
    return {
      ok: false,
      error: 'Could not update favorites. Changes were rolled back.',
    };
  }
}

