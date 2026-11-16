import 'server-only';
import { cookies } from 'next/headers';
import {
  FAVORITES_COOKIE_NAME,
  parseFavoriteIds,
  serializeFavoriteIds,
} from '@/lib/favorites-codec';

export { FAVORITES_COOKIE_NAME };
const FAVORITES_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function getFavoriteIdsFromCookie(): Promise<number[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FAVORITES_COOKIE_NAME)?.value;
  return parseFavoriteIds(raw);
}

export async function setFavoriteIdsInCookie(ids: number[]): Promise<number[]> {
  const { uniqueIds, json } = serializeFavoriteIds(ids);
  const cookieStore = await cookies();

  cookieStore.set(FAVORITES_COOKIE_NAME, json, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: FAVORITES_MAX_AGE_SECONDS,
  });

  return uniqueIds;
}
