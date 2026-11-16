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
├── .gitattributes        # Forces LF for *.sh, Dockerfiles and nginx config (safe Windows clones)
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

To reset the edited events back to the seed: `docker compose down -v` (removes the `api_data` and `internal_secret` volumes).

### Option B: Local Development (via `pnpm`)

**Prerequisites:** Node.js `22 LTS` (`apps/api` declares `"engines": { "node": ">=22" }`) and `pnpm 10` (`corepack enable` picks up `packageManager: pnpm@10.6.5`).

1. **Install dependencies from the monorepo root:**
   ```bash
   pnpm install --frozen-lockfile
   ```

2. **Create the env files and one shared `INTERNAL_SECRET`.** `apps/api` loads `apps/api/.env` (`dotenv`), `apps/web` loads `apps/web/.env.local` (Next.js). Both **must contain the same** `INTERNAL_SECRET`, otherwise the API ignores `x-client-ip` from SSR and every user shares one rate-limit bucket.

   **bash / Git Bash / macOS / Linux:**
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
   sed -i.bak "s|^INTERNAL_SECRET=.*|INTERNAL_SECRET=${SECRET}|" apps/api/.env apps/web/.env.local
   rm -f apps/api/.env.bak apps/web/.env.local.bak
   ```

   **PowerShell (Windows):**
   ```powershell
   Copy-Item apps/api/.env.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env.local
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $secret = [Convert]::ToBase64String($bytes)
   foreach ($f in 'apps/api/.env', 'apps/web/.env.local') {
     (Get-Content $f) -replace '^INTERNAL_SECRET=.*', "INTERNAL_SECRET=$secret" | Set-Content -Encoding utf8 $f
   }
   ```

3. **Start the backend and frontend in development mode:**
   ```bash
   # Terminal 1 — Express API on http://localhost:4000
   pnpm dev:api

   # Terminal 2 — Next.js 15 web app on http://localhost:3000
   pnpm dev:web
   ```

> **Note — IP-spoofing protection works only in Docker.** In Docker Compose, Nginx overwrites `X-Forwarded-For` / `X-Real-IP` with the real socket address and strips `x-client-ip` / `x-internal-secret` / `x-rate-limit-counted`. Locally there is no Nginx in front of `web`, so `web` trusts whatever `X-Forwarded-For` the browser (or `curl`) sends, and a client can pick its own rate-limit bucket. The API itself never trusts these headers without a valid `x-internal-secret`.

`.env.example` in the repo root documents the variables Docker Compose substitutes (`RATE_LIMIT_MAX`, `CACHE_TTL_MS`, …); it is optional — copy it to `.env` only to override defaults.

---

## 2. Running Tests

Run all workspace tests (`apps/api` and `apps/web`) from the root directory using `node:test` + `tsx` (with fake timers and isolated `os.tmpdir()` runtime data):

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm test
```

The API test suite sets `LOG_LEVEL=silent` (see `apps/api/src/lib/logger.ts`) so the expected `4xx`/`5xx` error logs don't clutter the output; run `LOG_LEVEL=info pnpm --filter @app/api test` to see them. Production keeps the default `info` level.

You can also run each package individually:
```bash
pnpm --filter @app/api test
pnpm --filter @app/web test
```

**Test coverage summary:**
- **API Cache (`apps/api/tests/api.test.ts`):** Warm `X-Cache: HIT` (<50ms without touching storage), TTL expiration with fake timers, LRU eviction beyond `maxEntries`, `PATCH` invalidation of `/events/:id` and all `/events` pages without evicting `/cities`, and query key normalization.
- **API Concurrency:** 50 identical cold requests coalesced into 1 storage read, 50 distinct keys reading independently, and failed-promise eviction without poisoning cache.
- **API Rate Limit:** Per-`x-client-ip` counters, cache-hit accounting, anti-spoofing (ignoring forged `x-client-ip`/`X-Forwarded-For`), `429 RATE_LIMITED` + `Retry-After`, fake-timer window reset, and isolated `internal` bucket.
- **API Validation & Errors:** `400 VALIDATION_ERROR` with field `details` (`page=abc/0/-1`, `limit`, oversized `q`/`city`, invalid/empty PATCH), `400 INVALID_JSON`, `413`, `415`, `404`, `405` (`Allow`), `500 INTERNAL_ERROR` (no stack trace leak), and matching `x-request-id` / `error.requestId`.
- **API Persistence, Seats & Shutdown:** Seed-to-runtime copy, restart persistence, concurrent field-merging `PATCH`, write-error `500` rollback consistency, uncached instant `/seats` (`0..capacity`), and `SIGTERM` graceful draining.
- **Web Unit Tests (`apps/web/tests/web.test.ts`):** Favorites cookie parsing/deduplication/limit, API error-to-UI message mapping (`404`/`429`/`5xx`/timeout/network), filter URL builder (`buildHref`), shared `UpdateEventBodySchema` limits, and the build-time selection of the 15 nearest upcoming events (`pickNearestUpcoming` / `collectNearestUpcoming`: past events dropped, sorting, cap, pagination stop, fewer than 15).

---

## 3. Caching Strategy

| Data / Endpoint | Where It Is Cached | TTL & Size Limit | How It Is Invalidated |
| :--- | :--- | :--- | :--- |
| **`GET /events`** (Filtered & paginated event list) | **Backend (`apps/api`):** In-memory `PromiseCache<PaginatedEvents>` backed by `lru-cache` keyed by normalized `(city, q, page, limit)`.<br>**Frontend (`apps/web`):** `cache: 'no-store'` on `/` (`force-dynamic`) so URL filters always reflect live API cache state. | **TTL:** `60,000 ms` (`60s`, configurable via `CACHE_TTL_MS`)<br>**Max Size:** `500` entries (`CACHE_MAX_ENTRIES`) | Automatically expires after TTL, evicts least-recently-used entries when full, evicted immediately on Promise rejection, and **explicitly cleared (`listCache.clear()`)** on `PATCH /events/:id` + Next.js `revalidatePath('/')`. |
| **`GET /events/:id`** (Single event details) | **Backend (`apps/api`):** In-memory `PromiseCache<Event \| null>` backed by `lru-cache` keyed by `id`.<br>**Frontend (`apps/web`):** Pre-rendered at build time for the **15 nearest upcoming events relative to build time** (`generateStaticParams` / SSG), and cached via Next.js Data & Full Route Cache (`cache: 'force-cache'`, `dynamicParams = true`) on first request for every other event. | **Backend TTL:** `60,000 ms` (`60s`), max `500` entries.<br>**Next.js Full Route Cache:** Persistent until revalidated. | **Backend:** Explicitly evicted via `itemCache.delete(String(id))` on `PATCH /events/:id`.<br>**Frontend:** Explicitly purged via `revalidatePath('/events/' + id)` and `revalidatePath('/events/' + id + '/edit')` inside the `updateEventAction` Server Action. |
| **`GET /cities`** (Unique sorted city list) | **Backend (`apps/api`):** In-memory `PromiseCache<string[]>` backed by `lru-cache` under key `'cities'`. | **TTL:** `60,000 ms` (`60s`)<br>**Max Size:** `500` entries | Expires automatically after the `60s` TTL (city list is static across title/description edits). |
| **`GET /events/:id/seats`** (Available seats counter) | **NEVER CACHED.** Served directly from in-memory capacity metadata (`peekById`) with `Cache-Control: no-store` on both `apps/api` and the Next.js `/api/events/[id]/seats` Route Handler proxy. | **TTL:** `0` (`no-store`) | N/A — generates a fresh cryptographically random integer (`0..capacity`) on every request without artificial DB latency. |
| **User Favorites (`/favorites`)** | **Per-User HTTP-Only Cookie** (`afisha_favorites`, `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`). Never stored in any shared server cache (`GET /api/favorites` uses `no-store` + `Vary: Cookie`; static HTML/ISR contains zero user favorites). | **Cookie Max-Age:** `30 days` (`2,592,000s`) | Updated per user via the `setFavoriteAction` Server Action (`Set-Cookie`) + `revalidatePath('/favorites')`. |
| **Runtime Events Store (`DATA_FILE`)** | **Persistent JSON File + In-Memory Map (`apps/api`):** Seeded on startup from `events.seed.json` if missing (`apps/api/data/events.json` locally or `/app/runtime-data/events.json` in Docker named volume `api_data`). | **Persistent across restarts** (`docker compose restart api`) | Updated atomically (temp file + `fs.rename()`) on `PATCH /events/:id`. Reset to `events.seed.json` by removing the file or running `docker compose down -v`. |

---

## 4. Decisions on Ambiguous Requirements

Where the assignment leaves room for interpretation, these are the choices made (details in the sections referenced):

1. **"15 nearest events" are pre-rendered relative to build time.** `generateStaticParams` (`apps/web/src/app/events/[id]/page.tsx`) pages through `GET /events` (sorted by date, `limit=50`, the API maximum), drops events dated before `Date.now()` at build time, and takes the first 15 (`pickNearestUpcoming` / `collectNearestUpcoming` in `apps/web/src/lib/nearest-events.ts`). If fewer than 15 upcoming events exist, all of them are pre-rendered. All other ids render on demand (`dynamicParams = true`) and are then cached.
2. **Page size:** `12` events per page on `/`; the API accepts `limit` `1..50` (default `12`) and `page >= 1`.
3. **Search:** `q` is a case-insensitive substring match on the **title only** (trimmed, max 100 chars). The city filter is an exact, case-insensitive match on `city`. Results are sorted by date, then by id.
4. **Available seats** are simulated: every `GET /events/:id/seats` returns a fresh random integer in `0..capacity` (never cached, no simulated DB latency). The event page polls it every 5 s and charts the last samples.
5. **Rate limit: 60 requests/min per client IP** (fixed window, `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`). What counts as one unit: opening `/` or `/favorites` (one preflight in `middleware.ts`, regardless of how many API calls the SSR makes), each debounced search / filter / pagination RSC request on `/`, each seats poll (12/min with an open event page), and each `PATCH` from the edit form. Cache hits count too: the limiter runs before the cache. Exceeding the limit returns `429` + `Retry-After`.
6. **Nginx in front of `web`** is the only published port (`3000`); it overwrites `X-Forwarded-For` / `X-Real-IP` and strips internal headers, so the client IP that `web` forwards to `api` cannot be spoofed (see §5.2).
7. **The `internal` rate-limit key:** build-time and ISR fetches (`generateStaticParams`, `fetchEventById` with `force-cache`) carry the secret but no client IP. They share one `internal` bucket of `max(RATE_LIMIT_MAX × 100, 1000)` req/min, so the static pages are not fragmented per IP (trade-off in §5.2).
8. **`INTERNAL_SECRET` is generated at runtime** by the one-shot `secret-init` service into a read-only shared volume. It is never in git, image layers or `docker inspect` env (see §5.9).
9. **Persistence:** edits are written atomically to a JSON file on the `api_data` named volume; they survive `docker compose restart`/`up` and are reset with `docker compose down -v` (see §5.6).
10. **No `loading.tsx` on `/`, `/favorites`, `/events/[id]`:** a segment-level `loading.tsx` broke `searchParams`-only soft navigations on `/` and made `/events/[id]` stream `200` before `notFound()`. Loading states use `<Suspense>` inside the pages instead (see §5.3).
11. **Field limits for editing** are our own choice: the assignment does not define them (see below).
12. **UI language is English** — all UI texts, validation and API error messages.

### Field Validation Limits

The assignment does not specify limits for editable fields, so they were chosen deliberately and defined once in `packages/shared/src/index.ts`:

| Field | Min | Max | Rules |
| :--- | :---: | :---: | :--- |
| `title` | `EVENT_TITLE_MIN = 3` | `EVENT_TITLE_MAX = 120` | Leading/trailing whitespace is trimmed before the length check; whitespace-only strings are rejected. |
| `description` | `EVENT_DESCRIPTION_MIN = 10` | `EVENT_DESCRIPTION_MAX = 2000` | Same trimming and rejection of whitespace-only input. |

- The body is `.strict()` (unknown keys → `400`), and at least one of `title` / `description` must be present.
- **One schema everywhere:** `UpdateEventBodySchema` from `@app/shared` validates `PATCH /events/:id` in the API (`event.controller.ts`), the `updateEventAction` Server Action (`apps/web/src/app/actions/events.ts`), and the same `EVENT_*` constants drive the form (`edit-event-form.tsx`: `minLength`/`maxLength`, live counters, hints). Client, server action and API therefore can never disagree.

---

## 5. Architectural Decisions

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
Inside Stage 2 (`builder`) of `apps/web/Dockerfile`, an ephemeral random secret is generated inside the same `RUN` command (`INTERNAL_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"` — never passed via `ARG`), `@app/api` starts in the background on `127.0.0.1:4000`, `wget` waits for `/health`, `pnpm --filter @app/web build` pre-renders the 15 nearest upcoming events via `generateStaticParams`, `kill -TERM` cleanly drains and stops the temporary API, and `grep` verifies the ephemeral build secret did not leak into `.next/standalone` or `.next/static`. Stage 3 (`runner`) runs as non-root user `nextjs` (`UID 1001`).

### 5. Search, City Filter & Pagination Soft Navigation (`search-filters.tsx`)
- All filter transitions on `/` — debounced search input (`300ms`), city dropdown selection (`handleCityChange`), pagination controls (`EventsPagination`), and filter reset (`handleReset`) — use `startTransition(() => router.replace(href, { scroll: false }))` with zero full-page reloads.
- While typing or while a transition is in flight (`isTypingRef.current || isPending`), local `<Input>` state is the single source of truth so stale responses never overwrite user input. When idle, external navigation (`window.next.router.replace` or browser Back/Forward `popstate`) cleanly synchronizes `query` and `city` with the URL.

### 6. Persistent Event Storage & Atomic Writes (`apps/api/src/services/eventStore.ts`)
- **Seed vs Runtime Separation:** The immutable 60-event seed lives in git at `apps/api/data/events.seed.json`. On startup, if the writable runtime file (`DATA_FILE`, defaulting to `apps/api/data/events.json` locally or `/app/runtime-data/events.json` in Docker on named volume `api_data`) does not exist yet, `api` seeds it atomically from `events.seed.json` and uses it for all subsequent reads and writes.
- **Atomic & Serialized `PATCH` Writes:** All `update()` calls are serialized via an in-memory promise mutex so concurrent `PATCH` requests never clobber each other, writing to a same-directory temp file followed by `fs.rename()`. In-memory state and caches are updated only **after** `fs.rename()` succeeds; any disk error returns `500` while keeping memory and cache consistent. `SIGTERM` waits for active requests and pending file writes before exiting.
- **Resetting Data in Docker:** Because runtime state is stored in the `api_data` named volume, `docker compose restart api` preserves edits, whereas `docker compose down -v` wipes the volume and resets data back to `events.seed.json`.

### 7. Favorites State on Static Pages & Zero Cross-User Cache Leak (`favorites-provider.tsx`)
- **Keeping `layout.tsx` Static-Friendly:** `RootLayout` does **not** call `cookies()` or `headers()`. Calling `cookies()` in `layout.tsx` would opt the entire tree out of static generation, breaking SSG/ISR for `/events/[id]`.
- **Two-Stage Hydration Without Flash of `0`:** On SSG/ISR pages (`/` and `/events/[id]`), `FavoritesProvider` initializes with `status: 'loading'` and fetches the user's HTTP-only cookie per browser session from `GET /api/favorites` (`dynamic = 'force-dynamic'`, `Cache-Control: no-store, max-age=0`, `Vary: Cookie`). While `status === 'loading'`, `HeaderFavoritesLink` and `FavoriteButton` display neutral fixed-width skeleton placeholders (never `0` or an inactive heart) so the UI does not jump on hydration.
- **`/favorites` Dynamic SSR:** `src/app/favorites/page.tsx` (`force-dynamic`) reads `cookies()` on the server and passes `initialEvents` directly into `<FavoritesList>`, rendering the saved cards immediately with zero empty flash.
- **Zero Cache Leak Across Users:** Neither the static HTML / ISR cache of `/events/[id]` nor `fetchEventById` (`cache: 'force-cache'`) ever reads or embeds `afisha_favorites`, and `/api/favorites` sends `Cache-Control: no-store` so shared caches never store per-user favorites.

### 8. Unified Error Handling, Timeouts & Resilience (`@app/shared`, `apps/api`, `apps/web`)
- **Backend Error Contract (`ApiErrorResponseSchema`):** Every non-2xx API response flows through a centralized `errorHandler` and returns `{ error: { code, message, details?, requestId } }` alongside the `x-request-id` header (reused from incoming requests when valid or generated via `crypto.randomUUID()`).
  - Status codes handled: `400 VALIDATION_ERROR` (Zod field `details`), `400 INVALID_JSON`, `404 NOT_FOUND`, `405 METHOD_NOT_ALLOWED` (with `Allow` header), `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED` (with `Retry-After`), and `500 INTERNAL_ERROR` (stack traces logged server-side only, never leaked to clients).
  - Unhandled promise rejections and uncaught exceptions are logged and trigger graceful server shutdown.
- **Frontend Timeouts & Typed Mapping (`api.ts`, `api-errors.ts`):** All server-to-API fetches enforce `AbortSignal.timeout(API_TIMEOUT_MS)` (`5000ms` default) and forward `x-request-id`. Errors map into `ApiHttpError` (`status`, `code`, `details`, `retryAfter`, `requestId`) or `ApiUnavailableError` (`timeout` / `network`).
- **UI Boundaries & Isolation:**
  - `404` invokes `notFound()`.
  - `429` displays `"Too many requests. Please try again in Ns."` and `5xx`/network/timeout displays `"Service temporarily unavailable"` with a `"Try again"` retry button (`router.refresh()` + `reset()`).
  - Route `error.tsx` boundaries (`/`, `/favorites`, `/events/[id]`, `/events/[id]/edit`) and `global-error.tsx` avoid raw `error.message` (masked in Next.js production), resolving user messages by `digest` while displaying `digest` in small muted text for log correlation.
  - List errors on `/` and `/favorites` render `<InlineApiError>` inside `<Suspense>` so the header and filters remain operational; `/events/[id]` wraps live seats inside `<SeatsErrorBoundary>` and `SeatsPoller` applies `Retry-After` on `429` plus exponential backoff (5s→60s) on upstream errors while keeping existing chart samples.
  - `/events/[id]/edit` validates with `UpdateEventBodySchema` (`EVENT_TITLE_MIN=3`..`EVENT_TITLE_MAX=120`, `EVENT_DESCRIPTION_MIN=10`..`EVENT_DESCRIPTION_MAX=2000`), returns `{ ok: false, fieldErrors, formError, values }` from `updateEventAction` (never throws on 4xx/5xx, calls `notFound()` on 404), preserves user input in controlled fields, shows live character counters, uses `useFormStatus()` to disable double-submits, and marks invalid inputs via `aria-invalid` / `aria-describedby`.

### 9. Secret Management Without Hardcoded Secrets (`docker-compose.yml`, `secret.ts`)
- **No Secrets in Git or Image Layers:** All `.env.example` templates, `docker-compose.yml`, and Dockerfiles contain zero default or hardcoded secret values (`git ls-files` tracks only `.env.example` templates).
- **Docker Runtime Init Volume:** A one-shot `secret-init` service (`alpine:3.21`, `restart: "no"`) generates a random 32-byte base64 secret into `/secrets/internal_secret` (`chmod 0444`) in the `internal_secret` named volume on first boot. Both `api` and `web` wait for `secret-init` (`service_completed_successfully`), mount the volume `:ro`, and receive only `INTERNAL_SECRET_FILE=/run/secrets/internal_secret` (nothing appears in `docker inspect` `Config.Env`).
- **Fail-Fast & Local Env Support:** Both `api` (`loadConfig`) and `web` (`getInternalSecret`, `instrumentation.ts`, and container startup) support `INTERNAL_SECRET_FILE` as well as `INTERNAL_SECRET` from env for local development, and fail immediately on production startup if no secret is provided.

---

## 6. Production Build of `apps/api`

**How:** `pnpm --filter @app/api build` runs `apps/api/scripts/build.mjs`, which uses **esbuild** to bundle `src/server.ts` together with the workspace package `@app/shared` into a single ESM file `dist/server.js` (`platform: 'node'`, `target: 'node22'`, sourcemap). Third-party dependencies (`express`, `cors`, `dotenv`, `express-rate-limit`, `lru-cache`, `zod`) stay **external** and are installed as regular `node_modules`. In `apps/api/Dockerfile` the builder stage runs the bundle and then `pnpm --filter @app/api --prod deploy --legacy /prod/api` to get a pruned production-only `node_modules`. The runtime stage (`node:22-alpine`, non-root `node` user) contains only `dist/`, prod `node_modules`, `package.json` and the seed data, and starts with `node dist/server.js`.

**Why:** `@app/shared` is consumed as TypeScript source (no separate build step), so inlining it into the bundle removes any need for workspace symlinks or `tsx` at runtime. esbuild compiles the whole API in milliseconds with a 20-line config, while `tsc --noEmit` stays the single source of type-checking. Keeping npm dependencies external (instead of bundling everything) leaves the runtime image with ordinary, auditable packages and avoids bundling issues with dynamic `require`s in Express middleware.

---

## 7. Graceful Shutdown (`SIGTERM`)

Implemented in `apps/api/src/lib/shutdown.ts`, wired in `apps/api/src/server.ts`:

1. On `SIGTERM` (also `SIGINT`), the server logs `[shutdown] Received SIGTERM…` and calls `server.close()` — it stops accepting **new** connections.
2. **In-flight requests are allowed to finish.** Responses sent during shutdown get `Connection: close`, and idle keep-alive sockets are closed (`closeIdleConnections()`), so clients don't hold the process open.
3. After the HTTP server has closed, `store.flushPendingWrites()` waits for any queued atomic JSON writes from `PATCH`, so no edit is lost or half-written.
4. Exit code `0` and `[shutdown] All active requests finished. Server closed cleanly.`
5. **Timeout:** if draining takes longer than `SHUTDOWN_TIMEOUT_MS` (`10000` ms in `docker-compose.yml`, default `10000`), the process logs `Could not drain connections within …ms; forcing exit.` and exits with code `1`. Docker's default stop grace period is also 10 s.
6. `unhandledRejection` / `uncaughtException` are logged and go through the same shutdown path with exit code `1`.

**How to verify:**
```bash
docker compose up -d --build
docker compose stop api          # sends SIGTERM
docker compose logs api | tail -n 5
# [shutdown] Received SIGTERM. Stopping new connections and draining active requests...
# [shutdown] All active requests finished. Server closed cleanly.
```
To see draining of an in-flight request, start a slow request (an uncached `GET /events` with a new query takes 300–800 ms of simulated DB latency) from inside the network, e.g. `docker compose exec web wget -qO- "http://api:4000/events?q=drain-test"`, and run `docker compose stop api` at the same time: the request still completes with `200`. The automated test `shutdown: waits for in-flight slow request to return 200, rejects new connections, and closes server cleanly` in `apps/api/tests/api.test.ts` covers the same scenario.

---

## 8. `next build` Output & Bundle Verification

Captured from a clean Docker build (`docker compose build --no-cache --progress=plain web`, Next.js 15.5.29, inside the `builder` stage of `apps/web/Dockerfile`):

```text
Route (app)                                 Size  First Load JS
┌ ƒ /                                    4.67 kB         120 kB
├ ○ /_not-found                            132 B         103 kB
├ ƒ /api/events/[id]/seats                 132 B         103 kB
├ ƒ /api/favorites                         132 B         103 kB
├ ● /events/[id]                         6.56 kB         148 kB
├   ├ /events/24
├   ├ /events/11
├   ├ /events/21
├   └ [+12 more paths]
├ ƒ /events/[id]/edit                    3.17 kB         145 kB
└ ƒ /favorites                            4.7 kB         120 kB
+ First Load JS shared by all             103 kB
  ├ chunks/901-cf72b069db1430b6.js       46.8 kB
  ├ chunks/e7e3044d-0d6b6d5e0b3db82f.js  54.2 kB
  └ other shared chunks (total)          2.04 kB


ƒ Middleware                             35.6 kB

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
```

`/events/[id]` shows `●` with 15 pre-rendered paths (3 listed + 12 more): the 15 nearest upcoming events at build time.

### Proof: recharts is not in the `/` and `/favorites` bundles

The chart (`seats-fill-chart.tsx`, the only file importing `recharts`) is loaded with `next/dynamic` from `seats-poller.tsx`, which is rendered only on `/events/[id]`. `apps/web/scripts/check-bundles.mjs` verifies this on the build output. It finds every client chunk containing recharts code (the `recharts-wrapper` class name), checks the initial chunks of each page in `app-build-manifest.json`, and shows which `next/dynamic` import loads the chunk via `react-loadable-manifest.json`. It exits with `1` if recharts is in `/` or `/favorites`.

Run against the production image (no rebuild needed):

```bash
docker compose build web
docker run --rm -v "$(pwd)/apps/web/scripts:/check:ro" --entrypoint node \
  testafisha-web:latest /check/check-bundles.mjs apps/web/.next
```

(The image name `testafisha-web` comes from the Compose project name, i.e. the repo folder name. Git Bash on Windows: prefix with `MSYS_NO_PATHCONV=1` and use `$(pwd -W)`. After a local `pnpm --filter @app/web build`: `node apps/web/scripts/check-bundles.mjs apps/web/.next`.)

Output:

```text
Client chunks scanned: 28
Chunks containing recharts ("recharts-wrapper"):
  static/chunks/422.dc81ce4abeeed819.js

Initial JS per page (app-build-manifest.json):
  /_not-found/page              5 chunks  no recharts
  /events/[id]/edit/page        8 chunks  no recharts
  /events/[id]/page             8 chunks  no recharts
  /page                         7 chunks  no recharts
  /favorites/page               7 chunks  no recharts

Lazy chunks (next/dynamic, react-loadable-manifest.json):
  components/seats-poller.tsx -> @/components/seats-fill-chart -> static/chunks/422.dc81ce4abeeed819.js  [react-loadable-manifest.json]

OK: recharts is not in the bundles of / and /favorites.
```

Cross-check with other recharts class names. Only the same lazy chunk (≈ 401 kB on disk) matches:

```bash
docker run --rm --entrypoint sh testafisha-web:latest -c \
  "cd apps/web/.next/static/chunks && grep -l -E 'recharts-(surface|cartesian-grid|tooltip-wrapper)' -r ."
# ./422.dc81ce4abeeed819.js
```

So `/` and `/favorites` (120 kB First Load JS each) contain no recharts code. On `/events/[id]` the chart chunk is fetched lazily only after the seats section mounts on the client, which is why it does not appear in that page's initial chunk list either.
