FROM node:22-alpine AS deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /workspace

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN pnpm --filter @app/api build

ENV NEXT_TELEMETRY_DISABLED=1

RUN set -eu; \
    INTERNAL_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"; \
    PORT=4000 \
    NODE_ENV=production \
    INTERNAL_SECRET="${INTERNAL_SECRET}" \
    DATA_FILE="/tmp/build-events.json" \
    DB_MIN_DELAY_MS=10 \
    DB_MAX_DELAY_MS=20 \
    node apps/api/dist/server.js & \
    API_PID=$!; \
    for i in $(seq 1 50); do \
      if wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1; then \
        break; \
      fi; \
      sleep 0.2; \
    done; \
    wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1; \
    API_URL="http://127.0.0.1:4000" \
    INTERNAL_SECRET="${INTERNAL_SECRET}" \
    pnpm --filter @app/web build; \
    kill -TERM "${API_PID}" 2>/dev/null || true; \
    wait "${API_PID}" 2>/dev/null || true; \
    rm -f /tmp/build-events.json; \
    if grep -rnF "${INTERNAL_SECRET}" apps/web/.next/standalone apps/web/.next/static; then \
      echo "ERROR: Build secret leaked into Next.js output!" >&2; \
      exit 1; \
    fi

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

CMD ["sh", "-eu", "-c", "if [ -n \"${INTERNAL_SECRET_FILE:-}\" ]; then if [ ! -s \"${INTERNAL_SECRET_FILE}\" ]; then echo \"ERROR: INTERNAL_SECRET_FILE (${INTERNAL_SECRET_FILE}) is missing or empty\" >&2; exit 1; fi; INTERNAL_SECRET=\"$(tr -d '\\r\\n' < \"${INTERNAL_SECRET_FILE}\")\"; export INTERNAL_SECRET; fi; if [ -z \"${INTERNAL_SECRET:-}\" ]; then echo \"ERROR: INTERNAL_SECRET or INTERNAL_SECRET_FILE is required\" >&2; exit 1; fi; exec node apps/web/server.js"]
