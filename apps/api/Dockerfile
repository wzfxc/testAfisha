# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Install workspace dependencies
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
# Stage 2: Build @app/shared and @app/api, then prune production dependencies
# ==============================================================================
FROM deps AS builder
WORKDIR /workspace

COPY tsconfig.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @app/shared build \
 && pnpm --filter @app/api build \
 && pnpm --filter @app/api --prod deploy --legacy /prod/api

# ==============================================================================
# Stage 3: Minimal production runtime (non-root)
# ==============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder --chown=node:node /prod/api/package.json ./package.json
COPY --from=builder --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=builder --chown=node:node /workspace/apps/api/data ./data

USER node

EXPOSE 4000

CMD ["node", "dist/server.js"]

