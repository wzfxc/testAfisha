import { NextResponse } from 'next/server';
import { EventIdParamsSchema } from '@app/shared';
import { ApiHttpError, fetchEventSeats } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for `/events/:id/seats` so client-side polling never exposes
 * `process.env.API_URL` or `process.env.INTERNAL_SECRET` in the client bundle.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rawParams = await context.params;
  const parsed = EventIdParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid event ID' } },
      { status: 400 },
    );
  }

  try {
    const data = await fetchEventSeats(parsed.data.id);
    return NextResponse.json(
      { data },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (err: unknown) {
    if (err instanceof ApiHttpError) {
      return NextResponse.json(
        { error: { message: err.message } },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: { message: 'Failed to load available seats' } },
      { status: 500 },
    );
  }
}

