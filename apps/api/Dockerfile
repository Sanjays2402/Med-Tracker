# syntax=docker/dockerfile:1.7
#
# Production image for @med/api.
#
# Multi-stage build with four discrete stages:
#
#   base      Pinned Node and pnpm. Shared by every other stage so the
#             toolchain version is declared once.
#   deps      Installs the full workspace dependency graph (incl. dev
#             deps) used to compile TypeScript. Cached on lockfile only.
#   build     Compiles @med/db and @med/api to plain JS in dist/.
#   prod-deps Re-installs the workspace with --prod so dev-only modules
#             (vitest, tsx, type packages) never reach the runner image.
#   runner    Distroless-like minimal layer that copies dist/ + prod
#             node_modules, drops to a non-root uid, and declares a
#             HEALTHCHECK against the API's /livez probe.
#
# Image properties for ops:
#   - non-root user (uid 10001, gid 10001)
#   - read-only friendly: only /app/data is expected to be writable
#   - tini-equivalent: node runs as PID 1 with --use-openssl-ca
#   - HEALTHCHECK calls /livez every 30s
#   - LABELs follow opencontainers spec so registries surface metadata
#
# Build context is the repo root (see docker-compose.yml and CI).

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

# ---------- deps (full, incl. dev) ----------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
# UI + icons exist in the workspace and are referenced by the lockfile;
# include them so pnpm can resolve the full graph deterministically.
COPY packages/ui/package.json packages/ui/package.json
COPY packages/icons/package.json packages/icons/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false

# ---------- build ----------
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @med/db build \
 && pnpm --filter @med/api build

# ---------- prod-deps (no dev) ----------
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/icons/package.json packages/icons/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile=false --filter @med/api...

# ---------- runner ----------
FROM node:${NODE_VERSION}-alpine AS runner

# Minimal runtime tools. wget is required by HEALTHCHECK; tini is used to
# reap zombies and forward signals so SIGTERM-on-rolling-restart drains
# cleanly rather than waiting for the 30s kill grace.
RUN apk add --no-cache tini wget \
 && addgroup -S -g 10001 med \
 && adduser -S -u 10001 -G med med

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    NODE_OPTIONS=--enable-source-maps

# Copy compiled JS and the pruned production node_modules. We intentionally
# do NOT copy source TypeScript, tests, or dev dependencies.
COPY --from=build      --chown=med:med /repo/apps/api/dist                ./dist
COPY --from=build      --chown=med:med /repo/apps/api/package.json        ./package.json
COPY --from=prod-deps  --chown=med:med /repo/node_modules                 ./node_modules
COPY --from=prod-deps  --chown=med:med /repo/apps/api/node_modules        ./apps/api/node_modules
COPY --from=prod-deps  --chown=med:med /repo/packages                     ./packages

# Writable volume for the append-only audit log. Helm mounts a PVC here.
RUN mkdir -p /app/data && chown -R med:med /app/data
VOLUME ["/app/data"]

USER med
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/livez || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

LABEL org.opencontainers.image.title="med-tracker-api" \
      org.opencontainers.image.description="Med-Tracker API service" \
      org.opencontainers.image.source="https://github.com/Sanjays2402/Med-Tracker" \
      org.opencontainers.image.licenses="MIT"
