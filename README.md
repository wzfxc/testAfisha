# Afisha Events Platform — Monorepo Technical Assignment

A production-ready event discovery and live seat-telemetry platform built as a `pnpm` monorepo with **Next.js 15 (App Router)**, **React 19**, **Node.js 22 LTS (Express 5)**, **Nginx reverse proxy**, and **TypeScript (strict mode)**.

---

## Monorepo Architecture

```text
.
├── apps/
│   ├── api/              # Node.js 22 + Express 5 REST API (Promise LRU cache, per-IP rate limiter, SIGTERM shutdown)
│   └── web/              # Next.js 15 (App Router) + React 19 frontend (standalone build, SSR/ISR, optimistic UI)
├── packages/
│   └── shared/           # Shared Zod schemas & inferred TypeScript types (@app/shared)
├── nginx/
│   └── default.conf      # Reverse proxy configuration overwriting X-Forwarded-For / X-Real-IP with $remote_addr
├── docker-compose.yml    # Single-command multi-container orchestration (proxy + web + api)
├── pnpm-workspace.yaml   # pnpm workspace configuration
├── .env.example          # Default environment variables template
├── .dockerignore         # Excludes node_modules, dist, .next, and secrets from Docker build contexts
└── .gitignore            # Unified root gitignore excluding all build artifacts and local env files
```

- **Strict TypeScript:** Zero `any` and zero `@ts-ignore` across all workspace packages (`"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`).
- **Workspace Package (`@app/shared`):** Imported by package name (`import { EventSchema, type Event } from '@app/shared'`) with no relative cross-package paths (`../../../packages/...`).

---

## 1. Running the Project

### Option A: Docker Compose (Recommended — Single Command)

From a clean clone, spin up the entire stack (`proxy` + `web` + `api`) with a single command:

```bash
docker compose up --build
```

- **Application URL (Nginx Reverse Proxy — the only port published to the host):** [http://localhost:3000](http://localhost:3000)
- `web` (`expose: ["3000"]`) and `api` (`expose: ["4000"]`) communicate strictly over the internal Docker network and are not directly exposed to external clients.

### Option B: Local Development (via `pnpm`)

**Prerequisites:** Node.js `>=20.19` / `22 LTS` and `pnpm` (or `corepack enable`).

1. **Install dependencies from the monorepo root:**
   ```bash
   pnpm install --frozen-lockfile
   ```

2. **Typecheck all workspace packages (works immediately before any build):**
   ```bash
   pnpm -r typecheck
   ```

3. **Start the backend and frontend in development mode:**
   ```bash
   # Terminal 1 — Start the Express API on http://localhost:4000
   pnpm dev:api

   # Terminal 2 — Start the Next.js 15 web app on http://localhost:3000
   pnpm dev:web
   ```

---

## 2. Running Tests

The backend integration test suite (`node:test` + `tsx`) verifies:
- **60-event startup dataset load** and chronological date sorting.
- **Thundering herd protection:** 50 simultaneous cold-cache requests to `GET /events` trigger **exactly 1** slow-DB read.
- **Warm-cache performance:** Subsequent requests return with `X-Cache: HIT` in single-digit milliseconds (no `300–800ms` delay).
- **Cache invalidation:** `PATCH /events/:id` immediately invalidates both `GET /events/:id` and `GET /events`.
- **Uncached live seats & 404 handling:** `GET /events/:id/seats` returns a fresh random integer (`0..capacity`) with zero DB delay; `GET /events/9999` and `GET /events/abc` return `404`.
- **Per-IP rate limiting, cache-hit counting & anti-spoofing:** Separate counters per `x-client-ip` when `x-internal-secret` is valid, cached responses (`X-Cache: HIT`) counted toward the limit, `429` with `Retry-After` on overflow, automatic recovery after `windowMs`, `internal` bucket isolation for build/ISR requests, and complete rejection of spoofed `x-client-ip` / `X-Forwarded-For` headers without a valid secret.

Run the tests from the root directory:

```bash
pnpm --filter @app/api test
```

---

## 3. Caching Strategy

| Data / Endpoint | Where It Is Cached | TTL & Size Limit | How It Is Invalidated |
| :--- | :--- | :--- | :--- |
| **`GET /events`** (Filtered & paginated event list) | **Backend (`apps/api`):** In-memory `PromiseCache<PaginatedEvents>` backed by `lru-cache` keyed by normalized `(city, q, page, limit)`.<br>**Frontend (`apps/web`):** `cache: 'no-store'` on `/` (`force-dynamic`) so URL filters always reflect live API cache state. | **TTL:** `60,000 ms` (`60s`, configurable via `CACHE_TTL_MS`)<br>**Max Size:** `500` entries (`CACHE_MAX_ENTRIES`) | Automatically expires after TTL, evicts least-recently-used entries when full, evicted immediately on Promise rejection, and **explicitly cleared (`listCache.clear()`)** on `PATCH /events/:id` + Next.js `revalidatePath('/')`. |
| **`GET /events/:id`** (Single event details) | **Backend (`apps/api`):** In-memory `PromiseCache<Event \| null>` backed by `lru-cache` keyed by `id`.<br>**Frontend (`apps/web`):** Pre-rendered at build time for the **15 nearest events** (`generateStaticParams` / SSG), and cached via Next.js Data & Full Route Cache (`cache: 'force-cache'`, `dynamicParams = true`) on first request for the remaining 45 events. | **Backend TTL:** `60,000 ms` (`60s`), max `500` entries.<br>**Next.js Full Route Cache:** Persistent until revalidated. | **Backend:** Explicitly evicted via `itemCache.delete(String(id))` on `PATCH /events/:id`.<br>**Frontend:** Explicitly purged via `revalidatePath('/events/' + id)` and `revalidatePath('/events/' + id + '/edit')` inside the `updateEventAction` Server Action. |
| **`GET /cities`** (Unique sorted city list) | **Backend (`apps/api`):** In-memory `PromiseCache<string[]>` backed by `lru-cache` under key `'cities'`. | **TTL:** `60,000 ms` (`60s`)<br>**Max Size:** `500` entries | Expires automatically after the `60s` TTL (city list is static across title/description edits). |
| **`GET /events/:id/seats`** (Available seats counter) | **NEVER CACHED.** Served directly from in-memory capacity metadata (`peekById`) with `Cache-Control: no-store` on both `apps/api` and the Next.js `/api/events/[id]/seats` Route Handler proxy. | **TTL:** `0` (`no-store`) | N/A — generates a fresh cryptographically random integer (`0..capacity`) on every request without artificial DB latency. |
| **User Favorites (`/favorites`)** | **Per-User HTTP-Only Cookie** (`afisha_favorites`, `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`). Never stored in any shared server cache. | **Cookie Max-Age:** `30 days` (`2,592,000s`) | Updated per user via the `setFavoriteAction` Server Action (`Set-Cookie`) + `revalidatePath('/favorites')`. |

---

## 4. Architectural Decisions

### 1. "Thundering Herd" Protection via Promise Caching (`apps/api/src/cache/promiseCache.ts`)
`PromiseCache<V>` wraps `LRUCache<string, Promise<V>>`. Both the cache lookup (`this.cache.get(key)`) and the insertion of the in-flight `Promise<V>` (`this.cache.set(key, promise)`) execute **synchronously** before any `await`.
- When 50 identical requests arrive concurrently on a cold key, the first creates and caches the in-flight Promise; the other 49 await the exact same Promise, resulting in **1 single database read**.
- Warm cache hits resolve on the next microtask (~0ms) without the `300–800ms` delay.
- Rejected promises are immediately evicted so transient errors are never cached.

### 2. Per-IP Rate Limiting, Cost Accounting, SSR Forwarding & Anti-Spoofing
1. **Nginx Reverse Proxy Boundary (`nginx/default.conf` & `docker-compose.yml`):**
   - Only `proxy` (Nginx) publishes port `3000:3000` to the host (`web` uses `expose: ["3000"]` and `api` uses `expose: ["4000"]`).
   - Nginx overwrites `X-Forwarded-For` and `X-Real-IP` with `$remote_addr` and clears any client-supplied internal headers (`x-rate-limit-counted`, `x-client-ip`, `x-internal-secret`):
     ```nginx
     proxy_set_header X-Forwarded-For $remote_addr;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header x-rate-limit-counted "";
     proxy_set_header x-client-ip "";
     proxy_set_header x-internal-secret "";
     ```
2. **Sanitization & Cost Accounting in `apps/web/src/middleware.ts` (`RATE_LIMIT_MAX=60` req/min):**
   - `middleware.ts` explicitly deletes `x-rate-limit-counted`, `x-client-ip`, and `x-internal-secret` from incoming request headers before processing.
   - **1 opening of `/` or `/favorites` = 1 unit:** `middleware.ts` performs an in-memory preflight check (`GET /rate-limit` on `api` with `x-internal-secret` + `x-client-ip`) which increments the IP's bucket by `1` and sets `x-rate-limit-counted: 1` for the downstream SSR render (`fetchEvents` + `fetchCities`), preventing double-counting when `/` fetches both events and cities in parallel.
   - **RSC soft-navigation search requests (`/?q=...&_rsc=...`) = 1 unit:** Soft navigations triggered by the debounced search input on `/` also pass through `middleware.ts` and consume `1` unit per debounced search request.
   - **Open event card seat polling = 12 units/min:** `/events/[id]` polls `/api/events/[id]/seats` once every 5 seconds (`12` req/min). With `RATE_LIMIT_MAX=60` per minute, a user keeping an event card open still has **48 requests/minute** of headroom for browsing and searching on `/`.
3. **Where HTTP `429` and the Browser Error Page Come From on `web`:**
   - Because Next.js App Router `page.tsx` and `error.tsx` cannot set custom HTTP status codes like `429`, `apps/web/src/middleware.ts` intercepts `/` and `/favorites` **before** streaming starts. When `api` returns `429`, `middleware.ts` responds with a true **`HTTP/1.1 429 Too Many Requests`** status code, forwards `Retry-After` and `RateLimit-*` headers, and renders a clean light-theme HTML error card in the browser (or plain 429 response for `_rsc` fetches).
   - For `/api/events/[id]/seats`, the Route Handler (`route.ts`) forwards `ApiHttpError.status` (`429`), which `SeatsPoller` catches locally and displays as an inline warning banner without crashing the event detail page.
4. **Key Resolution in `apps/api` & The `internal` Key Trade-Off:**
   - **Valid `x-internal-secret` + valid `x-client-ip`:** Bucket key is `ip:<x-client-ip>` with limit `RATE_LIMIT_MAX` (default `60` req/min).
   - **Valid `x-internal-secret` without `x-client-ip` (`internal` key):** Used by build-time `generateStaticParams` and `fetchEventById` (`cache: 'force-cache'`). Its limit is `max(RATE_LIMIT_MAX * 100, 1000)` (`6000` req/min by default).
   - **Architectural Trade-Off of `internal` for ISR:** Calling `headers()` or passing `x-client-ip` inside `fetchEventById` would opt `/events/[id]` out of static generation / ISR and fragment Next.js's fetch cache per IP. Therefore, `fetchEventById` uses the shared `internal` key. While existing events (`1..60`) and already-visited 404s (`/events/9999`) are served directly from Next.js's ISR cache (`x-nextjs-cache: HIT`), an attacker enumerating thousands of *distinct, never-before-seen* non-existent IDs (`/events/10001`, `/events/10002`, ...) will trigger on-demand ISR renders against `api` under the shared `internal` bucket (`6000` req/min).
   - **Missing or invalid `x-internal-secret`:** Any `x-client-ip`, `X-Forwarded-For`, or `x-rate-limit-counted` header is ignored, and the bucket key falls back to `ip:<req.socket.remoteAddress>`.

### 3. True HTTP `404` on `/events/[id]` and Why Segment-Level `loading.tsx` Is Avoided
- **Why there is no `loading.tsx` on `/`, `/favorites`, or `/events/[id]`:**
  1. **Next.js 15 Soft Navigation Bug with `loading.tsx` on `/`:** In Next.js 15 App Router, placing a segment-level `loading.tsx` on `/` (or inside a route group `app/(home)/loading.tsx`) wraps the route segment in an internal `LoadingBoundary` whose RSC flight reconciliation fails on every second `router.replace` transition when only `searchParams` (`?q=...`, `?city=...`, `?page=...`) change — the network response arrives, but the browser URL and event list fail to update. Removing `loading.tsx` makes `router.replace` succeed `12/12` times (`100%`).
  2. **True HTTP `404` Status Codes on `/events/[id]` and `/events/[id]/edit`:** A root `app/loading.tsx` or segment `app/events/[id]/loading.tsx` causes Next.js to stream a `200 OK` HTML shell before `EventDetailPage` awaits `fetchEventById(id)` and calls `notFound()`. Without `loading.tsx`, `generateMetadata` and `EventDetailPage` validate `/^\d+$/` and `await fetchEventById(id)` before any Suspense boundary flushes headers, returning a true `HTTP/1.1 404 Not Found` for `/events/9999`, `/events/abc`, and `/events/9999/edit` without requiring `htmlLimitedBots` workarounds in `next.config.ts`.
- **How Loading States Are Implemented Instead (`<Suspense>` Inside Pages):**
  - **Home (`src/app/page.tsx`):** The page heading and `<SearchFilters>` render immediately outside Suspense, while the event grid and pagination are extracted into an async `<EventsList query={query} />` Server Component wrapped in `<Suspense key={`${query.city ?? ''}:${query.q ?? ''}:${query.page}`} fallback={<ListSkeleton />}>`, complemented by the `isPending` (`useTransition`) spinner inside the search input.
  - **Favorites (`src/app/favorites/page.tsx`):** The header renders immediately and the async `<FavoritesContent />` component is wrapped in `<Suspense fallback={<FavoritesSkeleton />}>`, preserving smooth optimistic updates (`useOptimistic`) and `revalidatePath('/favorites')` after `setFavoriteAction`.
  - **Event Details (`src/app/events/[id]/page.tsx`):** Once the event record is resolved, live seat telemetry is isolated inside `<Suspense fallback={<SeatsSectionSkeleton />}><SeatsSection ... /></Suspense>`.

### 4. Solving the Docker Build-Time API Dilemma (`apps/web/Dockerfile`)
Inside Stage 2 (`builder`) of `apps/web/Dockerfile`, `@app/api` is built and started in the background on `127.0.0.1:4000` with `INTERNAL_SECRET`, `wget` waits for `/health`, `pnpm --filter @app/web build` pre-renders the 15 nearest events via `generateStaticParams`, and `kill -TERM` cleanly shuts down the temporary API server. Stage 3 (`runner`) runs `node apps/web/server.js` as non-root user `nextjs` (`UID 1001`).

### 5. Search, City Filter & Pagination Soft Navigation (`search-filters.tsx`)
- All filter transitions on `/` — debounced search input (`300ms`), city dropdown selection (`handleCityChange`), pagination controls (`EventsPagination`), and filter reset (`handleReset`) — use `startTransition(() => router.replace(href, { scroll: false }))` with zero full-page reloads.
- While typing or while a transition is in flight (`isTypingRef.current || isPending`), local `<Input>` state is the single source of truth so stale responses never overwrite user input. When idle, external navigation (`window.next.router.replace` or browser Back/Forward `popstate`) cleanly synchronizes `query` and `city` with the URL.

---

## 5. `next build` Output & Bundle Verification

```text
Route (app)                                 Size  First Load JS
┌ ƒ /                                    3.91 kB         119 kB
├ ○ /_not-found                            131 B         103 kB
├ ƒ /api/events/[id]/seats                 131 B         103 kB
├ ƒ /api/favorites                         131 B         103 kB
├ ● /events/[id]                         4.72 kB         120 kB
├   ├ /events/24
├   ├ /events/11
├   ├ /events/21
├   └ [+12 more paths]
├ ƒ /events/[id]/edit                     2.2 kB         118 kB
└ ƒ /favorites                            3.6 kB         119 kB
+ First Load JS shared by all             103 kB
  ├ chunks/70-ad1663d66282861a.js        46.6 kB
  ├ chunks/a9ea9537-0f3936cf873287d4.js  54.2 kB
  └ other shared chunks (total)          2.08 kB

ƒ Middleware                             35.6 kB

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
```
