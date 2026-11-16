import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';

export const FAVORITES_COOKIE_NAME = 'afisha_favorites';
const FAVORITES_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const FavoriteIdsSchema = z.array(z.number().int().positive());

export async function getFavoriteIdsFromCookie(): Promise<number[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FAVORITES_COOKIE_NAME)?.value;
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = FavoriteIdsSchema.safeParse(parsed);
    if (!validated.success) {
      return [];
    }
    return [...new Set(validated.data)];
  } catch {
    return [];
  }
}

export async function setFavoriteIdsInCookie(ids: number[]): Promise<number[]> {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const cookieStore = await cookies();

  cookieStore.set(FAVORITES_COOKIE_NAME, JSON.stringify(uniqueIds), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: FAVORITES_MAX_AGE_SECONDS,
  });

  return uniqueIds;
}
