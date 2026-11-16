# Afisha Events Platform — Monorepo Technical Assignment

A production-ready event discovery and live seat-telemetry platform built as a `pnpm` monorepo with **Next.js 15 (App Router)**, **React 19**, **Node.js 22 LTS (Express 5)**, and **TypeScript (strict mode)**.

---

## Monorepo Architecture

```text
.
├── apps/
│   ├── api/              # Node.js 22 + Express 5 REST API (Promise LRU cache, rate limiter, graceful shutdown)
│   └── web/              # Next.js 15 (App Router) + React 19 frontend (standalone build, SSR, optimistic UI)
├── packages/
│   └── shared/           # Shared Zod schemas & inferred TypeScript types (@app/shared)
├── docker-compose.yml    # Single-command multi-container orchestration
├── pnpm-workspace.yaml   # pnpm workspace configuration
├── .dockerignore         # Excludes node_modules, dist, .next, and secrets from Docker build contexts
└── .gitignore            # Unified root gitignore excluding all build artifacts and local env files
```

- **Strict TypeScript:** Zero `any` and zero `@ts-ignore` across all workspace packages (`"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`).
- **Workspace Package (`@app/shared`):** Imported by package name (`import { EventSchema, type Event } from '@app/shared'`) with no relative cross-package paths (`../../../packages/...`).

---

## 1. Running the Project

### Option A: Docker Compose (Recommended — Single Command)

From a clean clone, spin up the entire stack (`api` + `web`) with a single command:

```bash
docker compose up --build
```

- **Frontend (`apps/web`):** [http://localhost:3000](http://localhost:3000)
- **Backend API (`apps/api`):** [http://localhost:4000](http://localhost:4000)
- **Healthcheck:** [http://localhost:4000/health](http://localhost:4000/health)

### Option B: Local Development (via `pnpm`)

**Prerequisites:** Node.js `>=20.19` / `22 LTS` and `pnpm` (or `corepack enable`).

1. **Install dependencies from the monorepo root:**
   ```bash
   pnpm install
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
- **Zod validation & SSR rate-limit bypass:** Invalid payloads return `400 Bad Request`; requests with `x-internal-secret` bypass the IP rate limiter while public requests exceeding the limit receive `429 Too Many Requests`.

Run the tests from the root directory:

```bash
pnpm --filter @app/api test
# or using the root shortcut:
pnpm test
```

---

## 3. Caching Strategy

| Data / Endpoint | Where It Is Cached | TTL & Size Limit | How It Is Invalidated |
| :--- | :--- | :--- | :--- |
| **`GET /events`** (Filtered & paginated event list) | **Backend (`apps/api`):** In-memory `PromiseCache<PaginatedEvents>` backed by `lru-cache` keyed by normalized `(city, q, page, limit)`.<br>**Frontend (`apps/web`):** `cache: 'no-store'` on `/` (`force-dynamic`) so URL filters always reflect live API cache state. | **TTL:** `60,000 ms` (`60s`, configurable via `CACHE_TTL_MS`)<br>**Max Size:** `500` entries (`CACHE_MAX_ENTRIES`) | Automatically expires after TTL, evicts least-recently-used entries when full, evicted immediately on Promise rejection, and **explicitly cleared (`listCache.clear()`)** on `PATCH /events/:id` + Next.js `revalidatePath('/')`. |
| **`GET /events/:id`** (Single event details) | **Backend (`apps/api`):** In-memory `PromiseCache<Event \| null>` backed by `lru-cache` keyed by `id`.<br>**Frontend (`apps/web`):** Pre-rendered at build time for the **15 nearest events** (`generateStaticParams` / SSG), and cached via Next.js Data & Full Route Cache (`cache: 'force-cache'`) on first request for the remaining 45 events. | **Backend TTL:** `60,000 ms` (`60s`), max `500` entries.<br>**Next.js Full Route Cache:** Persistent until revalidated. | **Backend:** Explicitly evicted via `itemCache.delete(String(id))` on `PATCH /events/:id`.<br>**Frontend:** Explicitly purged via `revalidatePath('/events/' + id)` and `revalidatePath('/events/' + id + '/edit')` inside the `updateEventAction` Server Action. |
| **`GET /cities`** (Unique sorted city list) | **Backend (`apps/api`):** In-memory `PromiseCache<string[]>` backed by `lru-cache` under key `'cities'`. | **TTL:** `60,000 ms` (`60s`)<br>**Max Size:** `500` entries | Expires automatically after the `60s` TTL (city list is static across title/description edits). |
| **`GET /events/:id/seats`** (Available seats counter) | **NEVER CACHED.** Served directly from in-memory capacity metadata (`peekById`) with `Cache-Control: no-store` on both `apps/api` and the Next.js `/api/events/[id]/seats` Route Handler proxy. | **TTL:** `0` (`no-store`) | N/A — generates a fresh cryptographically random integer (`0..capacity`) on every request without artificial DB latency. |
| **User Favorites (`/favorites`)** | **Per-User HTTP-Only Cookie** (`afisha_favorites`, `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`). Never stored in any shared server cache. | **Cookie Max-Age:** `30 days` (`2,592,000s`) | Updated per user via the `setFavoriteAction` Server Action (`Set-Cookie`) + `revalidatePath('/favorites')`. |

---

## 4. Architectural Decisions

### 1. "Thundering Herd" Protection via Promise Caching (`apps/api/src/cache/promiseCache.ts`)
A standard value cache stores data only *after* the asynchronous database read resolves. If 50 identical requests arrive concurrently on a cold key while the database takes `300–800ms`, all 50 requests see a cache miss and trigger 50 redundant database reads.

**Our Solution:** `PromiseCache<V>` wraps `LRUCache<string, Promise<V>>`. Both the cache lookup (`this.cache.get(key)`) and the insertion of the in-flight `Promise<V>` (`this.cache.set(key, promise)`) execute **synchronously** before any `await`.
- The first request creates the Promise, stores it in the LRU cache immediately, and returns `{ value, status: 'MISS' }`.
- The remaining 49 concurrent requests find the in-flight Promise in the cache on the very same tick, `await` that shared Promise, and resolve together from **1 single database read**.
- Warm cache hits resolve on the next microtask (~0ms) without any `300–800ms` delay.
- If the loader Promise rejects, a `.catch()` handler checks `this.cache.peek(key) === promise` and deletes the entry so transient errors are never cached.

### 2. Rate Limiting & Secure SSR Bypass (`apps/api/src/middlewares/internalBypass.ts`)
Next.js Server Components and Server Actions make requests to `apps/api` from the server's IP address.
- If all SSR requests shared the Next.js server IP against the public rate limiter, 100 users loading `/` would exhaust a single shared IP bucket.
- Conversely, trusting an unverified `X-Forwarded-For` header from arbitrary clients would allow anyone in a browser to spoof another IP and bypass rate limiting.

**Our Solution:**
- `TRUST_PROXY_HOPS` defaults to `0` locally (and `1` behind a controlled reverse proxy), preventing browser clients from spoofing `X-Forwarded-For`.
- Server-to-server requests from Next.js (`apps/web/src/lib/api.ts`, guarded by `import 'server-only'`) attach a shared secret header: `x-internal-secret: process.env.INTERNAL_SECRET`.
- The `internalBypass` middleware compares the header against `process.env.INTERNAL_SECRET` using Node's constant-time `crypto.timingSafeEqual` and sets `res.locals.isInternalRequest = true`.
- `express-rate-limit` is configured with `skip: (_req, res) => res.locals.isInternalRequest === true`, bypassing SSR traffic while enforcing per-IP rate limits on direct client requests.

### 3. Solving the Docker Build-Time API Dilemma (`apps/web/Dockerfile`)
During `docker build`, Next.js executes `next build` and invokes `generateStaticParams()` in `/events/[id]/page.tsx` to pre-render the **15 nearest events**. Because Docker build stages are isolated from `docker-compose` runtime networks, a separate `api` container is not reachable during `docker build`.

**Our Solution:** InsideStage 2 (`builder`) of `apps/web/Dockerfile`:
1. We first bundle `@app/api` into `apps/api/dist/server.js`.
2. In the build `RUN` step, we start `node apps/api/dist/server.js &` in the background on `127.0.0.1:4000` with `INTERNAL_SECRET`, poll `http://127.0.0.1:4000/health` until ready, execute `pnpm --filter @app/web build` against `API_URL=http://127.0.0.1:4000`, and then send `kill -TERM "${API_PID}"` + `wait "${API_PID}"` to gracefully shut down the temporary API server.
3. Stage 3 (`runner`) copies only `.next/standalone`, `.next/static`, and `public` into a clean `node:22-alpine` image and runs `node apps/web/server.js` under the unprivileged `nextjs` (`UID 1001`) user.

### 4. Backend Production Build Strategy (`esbuild`)
`apps/api` is built for production using `esbuild` (`apps/api/scripts/build.mjs`), which bundles `apps/api/src/server.ts` together with the workspace package `@app/shared` into a single `apps/api/dist/server.js` ESM entry point while keeping third-party `node_modules` external.
- **Why this choice:** `@app/shared` can expose `"main": "src/index.ts"` and `"types": "src/index.ts"` directly without requiring a pre-compilation step. Consequently, `pnpm install && pnpm -r typecheck` succeeds immediately on a fresh clone before any build is run, while the production Docker image runs pure compiled JavaScript on Node 22 without shipping TypeScript sources or `tsx`.

### 5. Optimistic Favorites & Rapid-Click Race Protection (`favorites-provider.tsx`)
Favorites are persisted per user in an HTTP-only cookie (`afisha_favorites`).
- **Instant Optimistic UI:** `FavoritesProvider` uses React 19's `useOptimistic` hook so clicking the heart icon on an event card, on the event detail page, or on `/favorites` updates both the heart state (or removes the card on `/favorites`) and the global Header badge counter on the same frame.
- **5-Click Race Condition Protection:** Instead of a blind server-side toggle that can desynchronize when 5 rapid clicks arrive out of order, the client tracks synchronous click intent in `desiredMapRef` (`Map<eventId, boolean>`) and monotonic sequence numbers in `seqMapRef`, dispatching an idempotent target state `{ eventId, isFavorite: boolean }` through a serialized promise queue (`writeQueueRef`). Intermediate superseded clicks are coalesced so the final cookie state after reload is guaranteed to match the screen.
- **Rollback on Error:** If `setFavoriteAction` returns an error or throws, `committedIds` remains unchanged, `useOptimistic` automatically rolls back the UI, and an error toast notification is shown.

### 6. Dynamic Chart Import & Bundle Isolation (`next/dynamic`)
- **Zero Recharts in Main Bundle:** `SeatsFillChart` (`recharts`) is loaded exclusively on `/events/[id]` via `next/dynamic(() => import('@/components/seats-fill-chart'), { ssr: false })`.
- **Sequential 5-Second Polling & Fault Isolation:** `SeatsPoller` uses a recursive `setTimeout` inside `finally` so the 5-second timer starts **only after** the previous `/api/events/[id]/seats` request completes, and cancels in-flight requests on unmount via `AbortController`. Errors (such as HTTP `500` or `429` on `/seats`) are caught locally inside `SeatsPoller` and rendered as an inline warning banner without crashing the event detail page.
- **No Server Env Vars in Client Bundle:** `apps/web/src/lib/api.ts` uses `import 'server-only'`, and client seat polling calls the same-origin Next.js Route Handler `/api/events/[id]/seats`, ensuring neither `API_URL` nor `INTERNAL_SECRET` ever appears in client chunks.

---

## 5. `next build` Output & Bundle Verification

Actual output from `pnpm --filter @app/web build`:

```text
   ▲ Next.js 15.5.29

   Creating an optimized production build ...
 ✓ Compiled successfully in 3.6s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/18) ...
 ✓ Generating static pages (18/18)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                     3.9 kB         119 kB
├ ○ /_not-found                            134 B         103 kB
├ ƒ /api/events/[id]/seats                 134 B         103 kB
├ ƒ /api/favorites                         134 B         103 kB
├ ● /events/[id]                          1.9 kB         121 kB
├   ├ /events/24
├   ├ /events/11
├   ├ /events/21
├   └ [+12 more paths]
├ ƒ /events/[id]/edit                    2.19 kB         118 kB
└ ƒ /favorites                           3.62 kB         119 kB
+ First Load JS shared by all             103 kB
  ├ chunks/70-ad1663d66282861a.js        46.6 kB
  ├ chunks/a9ea9537-0f3936cf873287d4.js  54.2 kB
  └ other shared chunks (total)          2.08 kB

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
```

### Verification that `recharts` and `API_URL` are absent from `/` and `/favorites` chunks:
- Inspecting `.next/app-build-manifest.json` confirms that `/page` (`3.9 kB`) and `/favorites/page` (`3.62 kB`) load only the shared React/Next runtime and Lucide icons.
- `recharts` is isolated in an asynchronous dynamic chunk loaded exclusively when `/events/[id]` mounts `<SeatsPoller />`.
- Scanning all `.next/static/chunks/**/*.js` files for `/` and `/favorites` confirms `0` occurrences of `recharts`, `AreaChart`, `ResponsiveContainer`, `API_URL`, or `INTERNAL_SECRET`.

