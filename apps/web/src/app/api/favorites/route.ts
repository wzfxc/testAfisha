import { NextResponse } from 'next/server';
import { getFavoriteIdsFromCookie } from '@/lib/favorites-cookie';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const favoriteIds = await getFavoriteIdsFromCookie();
  return NextResponse.json(
    { favoriteIds },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        Vary: 'Cookie',
      },
    },
  );
}

