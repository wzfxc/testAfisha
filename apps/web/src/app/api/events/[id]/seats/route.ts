import { NextResponse } from 'next/server';
import { EventIdParamsSchema } from '@app/shared';
import { ApiHttpError, ApiUnavailableError, fetchEventSeats } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rawParams = await context.params;
  const parsed = EventIdParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid event ID', requestId: 'web' } },
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
      const headers = new Headers({ 'Cache-Control': 'no-store, max-age=0' });
      if (err.retryAfter !== undefined) {
        headers.set('Retry-After', String(err.retryAfter));
      }
      if (err.requestId) {
        headers.set('x-request-id', err.requestId);
      }
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            retryAfter: err.retryAfter,
            requestId: err.requestId ?? 'web',
          },
        },
        { status: err.status, headers },
      );
    }

    if (err instanceof ApiUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: err.message,
            requestId: err.requestId ?? 'web',
          },
        },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Service temporarily unavailable',
          requestId: 'web',
        },
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }
}
