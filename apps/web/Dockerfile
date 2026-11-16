# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Install monorepo dependencies
# ==============================================================================
FROM node:22-alpine AS deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2: Build @app/shared, @app/api, and @app/web (with ephemeral API server)
# ==============================================================================
FROM deps AS builder
WORKDIR /workspace

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# 1. Build shared schemas and the backend API
RUN pnpm --filter @app/shared build \
 && pnpm --filter @app/api build

# 2. Spin up the compiled API server in the background during `next build` so
#    `generateStaticParams` can fetch and pre-render the 15 nearest events,
#    then gracefully stop the temporary API server via SIGTERM.
ARG INTERNAL_SECRET=build-time-internal-secret
ENV NEXT_TELEMETRY_DISABLED=1

RUN set -eu; \
    PORT=4000 \
    NODE_ENV=production \
    INTERNAL_SECRET="${INTERNAL_SECRET}" \
    DB_MIN_DELAY_MS=10 \
    DB_MAX_DELAY_MS=20 \
    node apps/api/dist/server.js & \
    API_PID=$!; \
    echo "[build] Waiting for temporary API server (PID ${API_PID}) on 127.0.0.1:4000..."; \
    for i in $(seq 1 50); do \
      if wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1; then \
        echo "[build] Temporary API server is healthy."; \
        break; \
      fi; \
      sleep 0.2; \
    done; \
    wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1; \
    API_URL="http://127.0.0.1:4000" \
    INTERNAL_SECRET="${INTERNAL_SECRET}" \
    pnpm --filter @app/web build; \
    echo "[build] Stopping temporary API server (PID ${API_PID})..."; \
    kill -TERM "${API_PID}" 2>/dev/null || true; \
    wait "${API_PID}" 2>/dev/null || true

# ==============================================================================
# Stage 3: Production Next.js standalone runner (non-root user)
# ==============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

