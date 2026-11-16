import { z } from 'zod';

export const FAVORITES_COOKIE_NAME = 'afisha_favorites';
export const MAX_FAVORITE_IDS = 50;

const FavoriteIdsSchema = z.array(z.number().int().positive());

export function normalizeFavoriteIds(ids: number[]): number[] {
  const valid = ids.filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(valid)].slice(0, MAX_FAVORITE_IDS);
}

export function parseFavoriteIds(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = FavoriteIdsSchema.safeParse(parsed);
    if (!validated.success) {
      return [];
    }
    return normalizeFavoriteIds(validated.data);
  } catch {
    return [];
  }
}

export function serializeFavoriteIds(ids: number[]): { uniqueIds: number[]; json: string } {
  const uniqueIds = normalizeFavoriteIds(ids);
  return {
    uniqueIds,
    json: JSON.stringify(uniqueIds),
  };
}

