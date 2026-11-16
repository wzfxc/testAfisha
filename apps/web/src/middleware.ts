import { NextResponse, type NextRequest } from 'next/server';

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:4000';
const DEFAULT_API_TIMEOUT_MS = 5_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function getApiTimeoutMs(): number {
  const raw = Number(process.env.API_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_API_TIMEOUT_MS;
}

function getOrCreateRequestId(req: NextRequest): string {
  const raw = req.headers.get('x-request-id')?.trim();
  if (raw && REQUEST_ID_PATTERN.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

function isValidIpString(ip: string): boolean {
  const ipv4Regex =
    /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  return ipv4Regex.test(ip) || (ip.includes(':') && ipv6Regex.test(ip));
}

function extractClientIpFromRequest(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first && isValidIpString(first)) {
      return first;
    }
  }

  const xRealIp = req.headers.get('x-real-ip')?.trim();
  if (xRealIp && isValidIpString(xRealIp)) {
    return xRealIp;
  }

  return '127.0.0.1';
}

function renderRateLimitHtml(retryAfter: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="light" style="color-scheme: light;">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>429 Too Many Requests | Afisha Events</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { max-width: 28rem; width: 100%; background: #ffffff; border: 1px solid #fecaca; border-radius: 0.5rem; padding: 1.75rem; text-align: center; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
    .badge { display: inline-flex; padding: 0.25rem 0.625rem; border-radius: 9999px; background: #fef2f2; color: #dc2626; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.75rem; }
    h1 { margin: 0; font-size: 1.125rem; font-weight: 600; color: #0f172a; }
    p { margin: 0.5rem 0 1.25rem; font-size: 0.875rem; color: #475569; line-height: 1.5; }
    a { display: inline-flex; height: 2.25rem; align-items: center; justify-content: center; padding: 0 1rem; border-radius: 0.375rem; background: #2563eb; color: #ffffff; font-size: 0.875rem; font-weight: 500; text-decoration: none; }
    a:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card" role="alert">
    <span class="badge">HTTP 429 &middot; Rate Limit Exceeded</span>
    <h1>Too many requests</h1>
    <p>Too many requests. Please try again in ${retryAfter}s.</p>
    <a href="/">Try again</a>
  </div>
</body>
</html>`;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const sanitizedHeaders = new Headers(req.headers);
  sanitizedHeaders.delete('x-rate-limit-counted');
  sanitizedHeaders.delete('x-client-ip');
  sanitizedHeaders.delete('x-internal-secret');

  const requestId = getOrCreateRequestId(req);
  sanitizedHeaders.set('x-request-id', requestId);

  const secret = process.env.INTERNAL_SECRET?.trim();
  const clientIp = extractClientIpFromRequest(req);

  try {
    const checkRes = await fetch(`${API_BASE_URL}/rate-limit`, {
      method: 'GET',
      signal: AbortSignal.timeout(getApiTimeoutMs()),
      headers: {
        ...(secret ? { 'x-internal-secret': secret } : {}),
        'x-client-ip': clientIp,
        'x-request-id': requestId,
      },
      cache: 'no-store',
    });

    const limitHeader = checkRes.headers.get('ratelimit-limit');
    const remainingHeader = checkRes.headers.get('ratelimit-remaining');
    const resetHeader = checkRes.headers.get('ratelimit-reset');

    if (checkRes.status === 429) {
      const retryAfter = checkRes.headers.get('retry-after') ?? resetHeader ?? '60';
      const isRscRequest = req.headers.get('rsc') === '1' || req.nextUrl.searchParams.has('_rsc');
      const headers = new Headers({
        'Content-Type': isRscRequest ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'Retry-After': retryAfter,
        'x-request-id': requestId,
      });
      if (limitHeader) headers.set('RateLimit-Limit', limitHeader);
      if (remainingHeader) headers.set('RateLimit-Remaining', remainingHeader);
      if (resetHeader) headers.set('RateLimit-Reset', resetHeader);

      const body =
        req.method === 'HEAD'
          ? null
          : isRscRequest
            ? `Too many requests. Please try again in ${retryAfter}s.`
            : renderRateLimitHtml(retryAfter);

      return new NextResponse(body, {
        status: 429,
        headers,
      });
    }

    sanitizedHeaders.set('x-rate-limit-counted', '1');

    const response = NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });

    response.headers.set('x-request-id', requestId);
    if (limitHeader) response.headers.set('RateLimit-Limit', limitHeader);
    if (remainingHeader) response.headers.set('RateLimit-Remaining', remainingHeader);
    if (resetHeader) response.headers.set('RateLimit-Reset', resetHeader);

    return response;
  } catch {
    const response = NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });
    response.headers.set('x-request-id', requestId);
    return response;
  }
}

export const config = {
  matcher: ['/', '/favorites'],
};
