# syntax=docker/dockerfile:1.7
#
# Production image for @med/web (Next.js standalone output).
#
# Mirrors the API Dockerfile's stage layout (base/deps/build/runner) so
# both services share the same hardening posture: non-root user, pinned
# Node + pnpm via corepack, minimal runner with HEALTHCHECK, tini as PID
# 1, and OCI labels.

ARG NODE_VERSION=20.18.0
ARG PNPM_VERSION=9.12.0

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/icons/package.json packages/icons/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false

# ---------- build ----------
FROM deps AS build
COPY packages ./packages
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @med/web build

# ---------- runner ----------
FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache tini wget \
 && addgroup -S -g 10001 med \
 && adduser -S -u 10001 -G med med

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output bundles only what the app actually uses, so
# we copy the standalone tree plus static assets and public/. No pnpm
# install is needed at runtime.
COPY --from=build --chown=med:med /repo/apps/web/.next/standalone        ./
COPY --from=build --chown=med:med /repo/apps/web/.next/static            ./apps/web/.next/static
COPY --from=build --chown=med:med /repo/apps/web/public                  ./apps/web/public

USER med
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]

LABEL org.opencontainers.image.title="med-tracker-web" \
      org.opencontainers.image.description="Med-Tracker web frontend" \
      org.opencontainers.image.source="https://github.com/Sanjays2402/Med-Tracker" \
      org.opencontainers.image.licenses="MIT"
