# Med-Tracker

Medication adherence platform: schedule doses, log takes/skips, warn on interactions, share with caregivers.

![landing](docs/screenshots/landing.png)

## What it does

Med-Tracker tracks what medications a user is on, when each dose is due, and whether it actually got taken. Patients log doses (take, skip, snooze), the API computes streaks and weekly adherence, and a reminder engine surfaces upcoming and pending doses. It also runs interaction checks against a seeded drug catalog, projects refill needs from current supply and dose rate, and exposes a signed read-only view that caregivers can use to follow along. Target users are people managing multi-drug regimens and the caregivers helping them.

Core flow: add a medication, attach a schedule, the engine generates dose instances, you mark them taken/skipped/snoozed, reports and streaks update.

## Features

- Medication CRUD with activate/archive lifecycle
- Schedules with conflict detection, travel time-zone resolve, and titration timelines
- Dose log: take, skip, snooze, today/upcoming/history views
- Reminder engine with pending queue and test notification endpoint
- Adherence streaks plus streak forecasting
- Weekly and monthly adherence reports, plus CSV / JSON / PDF / ICS export
- Drug interaction check (pairwise + per-user graph) against seeded catalog
- Pill identification endpoint and pill catalog
- Refill tracking: per-refill records, batch ops, and a "refills needed" projection
- Caregiver accounts with rotating share tokens, digest, and handoff
- Cold-chain status checks for temperature-sensitive meds
- Cost / alternatives lookup and pharmacy webhook ingress
- Side-effect correlation and adherence risk scoring
- Escalation queue for missed-dose follow-up
- JWT auth (signup / login / refresh / logout), per-user preferences
- Admin endpoints for users + stats
- Web PWA (Next.js 16, App Router), Expo mobile shell with `expo-notifications`
- i18n content for en, es, fr, hi
- Seeded drug content in `content/drugs/` with generated index

## Stack

- Monorepo: pnpm workspaces + Turborepo
- Web: Next.js 16, React 18, Tailwind v4 (alpha) + PostCSS
- Mobile: Expo SDK 51, expo-router, expo-notifications, React Native 0.74
- API: Fastify 5, `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, Zod
- DB: Prisma 5; SQLite for local dev, Postgres 16 for Docker/prod
- Tooling: TypeScript 5.6, ESLint 9, Prettier 3, Husky + lint-staged, Commitlint, Vitest
- Infra: Docker Compose (postgres + api + web), Renovate, GitHub Actions

## Architecture

Three apps share five packages. The API is the only thing that touches Prisma; web and mobile call it over HTTP.

```
                  ┌──────────────┐      ┌──────────────┐
                  │  apps/web    │      │ apps/mobile  │
                  │  Next.js 16  │      │  Expo / RN   │
                  └──────┬───────┘      └──────┬───────┘
                         │ HTTP (JSON, JWT)    │
                         └──────────┬──────────┘
                                    ▼
                          ┌───────────────────┐
                          │     apps/api      │
                          │  Fastify + Zod    │
                          │  reminder engine  │
                          └─────────┬─────────┘
                                    │ Prisma
                                    ▼
                          ┌───────────────────┐
                          │   packages/db     │
                          │  SQLite | Postgres│
                          └───────────────────┘

shared: packages/types (Zod), packages/ui, packages/icons,
        packages/utils, packages/config
seeded: content/drugs/*.json  →  drugs-index.json
```

## Quick start

Prereqs: Node `>=20.18.0` (see `.nvmrc`: `20.18.0`), pnpm `>=9` (repo pins `pnpm@9.12.0`). Docker only if you want Postgres instead of the SQLite dev file.

```bash
git clone <repo-url> Med-Tracker
cd Med-Tracker
nvm use                       # picks up .nvmrc
pnpm install
cp .env.example .env          # then edit values
pnpm db:migrate               # prisma migrate deploy via @med/db
pnpm db:seed                  # loads seed data
pnpm dev                      # turbo runs all apps in parallel
```

Web: http://localhost:3000 · API: http://localhost:4000

Postgres path (optional):

```bash
docker compose up -d postgres
# set DATABASE_URL=postgres://med:med@localhost:5432/med_tracker in .env
pnpm db:migrate
```

Full stack in Docker:

```bash
docker compose up --build
```

## Configuration

Root `.env` (copied from `.env.example`):

| Var                        | Default                            | Purpose                                                          |
| -------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                 | `development`                      | Standard Node env flag                                           |
| `PORT`                     | `4000`                             | API listen port                                                  |
| `JWT_SECRET`               | `change-me`                        | HMAC secret for `@fastify/jwt`; replace in any non-dev env       |
| `WEB_ORIGIN`               | `http://localhost:3000`            | CORS allow-list for the API                                      |
| `DATABASE_URL`             | `file:./packages/db/prisma/dev.db` | Prisma connection string; swap for `postgres://...` for Postgres |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000`            | Base URL the web app calls                                       |

`packages/db/.env.example` mirrors `DATABASE_URL` and `JWT_SECRET` for running Prisma CLI directly inside that package.

## Scripts

Root (`package.json`):

| Script            | What it runs                                              |
| ----------------- | --------------------------------------------------------- |
| `pnpm dev`        | `turbo run dev --parallel` across all apps                |
| `pnpm build`      | `turbo run build`                                         |
| `pnpm lint`       | `turbo run lint`                                          |
| `pnpm test`       | `turbo run test` (Vitest in each package)                 |
| `pnpm typecheck`  | `turbo run typecheck`                                     |
| `pnpm format`     | `prettier --write .`                                      |
| `pnpm db:migrate` | `pnpm --filter @med/db migrate` (`prisma migrate deploy`) |
| `pnpm db:seed`    | `pnpm --filter @med/db seed`                              |
| `pnpm prepare`    | Husky install (auto on `pnpm install`)                    |

Per-package extras: `apps/api` has `dev` (`tsx watch src/server.ts`), `build`, `start`. `apps/web` has `dev`/`build`/`start` on port 3000, `next lint`. `apps/mobile` has `start`, `android`, `ios` via Expo. `packages/db` has `migrate`, `migrate:dev`, `seed`, `build` (`prisma generate`).

Shell scripts in `scripts/`: `build.sh`, `clean.sh`, `dev.sh`, `lint-all.sh`, `release.sh`, `reset-db.sh`, `generate-icons.sh`, plus `gen-drugs.js` / `gen-drug-index.js` for regenerating `content/drugs/`.

## API

Fastify server in `apps/api/src/server.ts`. Routes auto-registered from `apps/api/src/routes/`.

Auth

- `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /me`, `PATCH /me`, `DELETE /me` (GDPR erasure)
- `GET /me/export` (GDPR data portability)
- `GET /preferences`, `PUT /preferences`

Medications

- `GET /medications`, `POST /medications`
- `GET /medications/:id`, `PATCH /medications/:id`, `DELETE /medications/:id`
- `POST /medications/:id/activate`, `POST /medications/:id/archive`

Schedules

- `GET /schedules`, `POST /schedules`
- `GET /schedules/:id`, `PATCH /schedules/:id`, `DELETE /schedules/:id`
- `POST /schedules/resolve`, `POST /schedules/travel`, `GET /schedules/conflicts` (via `schedules-conflicts.ts`)

Doses

- `GET /doses`, `PATCH /doses/:id`, `GET /doses/:id`
- `GET /doses/today`, `GET /doses/upcoming`, `GET /doses/history`
- `POST /doses/:id/take`, `POST /doses/:id/skip`, `POST /doses/:id/snooze`

Reminders & notifications

- `GET /reminders/pending`, `POST /reminders/pending`, `POST /reminders/engine/run`
- `GET /notifications`, `GET /notifications/:id`, `PATCH /notifications/:id`, `DELETE /notifications/:id`
- `POST /notifications/mark/read`, `POST /notifications/test`

Streaks & reports

- `GET /streaks`, `GET /streaks/:id`, `POST /streaks/forecast`
- `GET /reports/weekly`, `GET /reports/monthly`, `POST /reports/monthly`
- `GET /reports/adherence`, `POST /reports/adherence`
- `GET /reports/export/csv`, `GET /reports/export/json`, `GET /reports/export/pdf`, export/ics route

Refills

- `GET /refills`, `POST /refills`, `GET /refills/:id`, `POST /refills/:id`, `PATCH /refills/:id`, `DELETE /refills/:id`
- `POST /refills/batch`, `GET /refills/needed`, `POST /refills/needed`

Drugs, interactions, pills

- `GET /drugs/classes`, drug search + `drugs/:id` lookups
- `POST /interactions/check`, `GET /interactions/for/user`, `GET /interactions/graph`
- `POST /pills/identify`, `GET /pills/catalog`

Caregivers & sharing

- `GET /caregivers`, `POST /caregivers`, `GET /caregivers/:id`, `DELETE /caregivers/:id`
- `POST /caregivers/:id/rotate`, caregiver digest endpoint, `POST /caregivers/handoff`
- `GET /shared/view`

Other

- `POST /cold-chain/status`, `POST /cost/alternatives`
- `POST /side-effects/correlate`, `POST /risk/adherence`
- `POST /titration/lookup`, `POST /titration/timeline`
- `POST /escalation/pending`, `POST /escalation/next`
- `POST /webhooks/pharmacy`
- `GET /health`
- Admin: `GET /admin/users`, `GET /admin/stats`

## Project structure

```
.
├── apps/
│   ├── api/         Fastify server, route-per-file in src/routes/
│   ├── web/         Next.js 16 App Router
│   └── mobile/      Expo Router + RN
├── packages/
│   ├── db/          Prisma schema, migrations, seed
│   ├── types/       Shared Zod schemas
│   ├── ui/          React component library
│   ├── icons/       Phosphor-style duotone SVGs
│   ├── utils/       Shared helpers
│   └── config/      Shared tsconfig / eslint presets
├── content/drugs/   Seeded drug JSON + index
├── locales/         en, es, fr, hi
├── docs/            Architecture, ADRs, API ref, screenshots
├── scripts/         Build, release, reset-db, icon + drug generators
├── tests/           Cross-package test setup
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Operations

Production-facing concerns for running the API service.

### Authentication and RBAC

The API exposes two reusable preHandlers via the `auth` plugin
(`apps/api/src/plugins/auth.ts`):

- `app.authenticate` verifies the bearer JWT through `@fastify/jwt` and
  populates `req.authUser` with `{ sub, role, email }`. The role is read
  from the `role` claim, falling back to the first entry of a `roles`
  array claim, and finally to `'user'` when the token carries neither.
- `app.requireRole(role)` runs `authenticate` and then asserts the
  resolved role matches, returning `403` with `error.code = 'forbidden'`
  when it does not.

Applied to:

- `GET /admin/users` and `GET /admin/stats` are gated by
  `app.requireRole('admin')`.
- `GET /admin/audit` accepts either an admin-roled JWT or the legacy
  `x-admin-token` header (kept as a break-glass path for operators who
  do not yet have a provisioned admin account). When `ADMIN_TOKEN` is
  empty, only the JWT path is accepted.

Issuing an operator token, given a configured `JWT_SECRET`:

```
node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'ops-alice',role:'admin',email:'alice@example.com'},process.env.JWT_SECRET,{expiresIn:'8h'}))"
```

Then call admin endpoints with `Authorization: Bearer <token>`. Denials
are logged at warn level as `rbac_denied` with the request id, required
role, actual role, and subject for incident review.

Non-production environments additionally accept `x-user-id` (and
optional `x-user-role`) as a developer convenience. These headers are
refused entirely when `NODE_ENV=production` so a stray header cannot
bypass authentication in a real deployment.

Coverage lives in `apps/api/tests/rbac.test.ts` and exercises the 401,
403, 200, malformed-token, and admin-role paths against an in-process
Fastify instance.

### Tenant isolation

The `tenant` plugin (`apps/api/src/plugins/tenant.ts`) resolves a tenant
identifier for every authenticated request and exposes helpers that
routes and services use to scope reads and writes to a single tenant.

Resolution order, first match wins:

1. JWT claim `tid`
2. JWT claim `tenant`
3. JWT claim `org`
4. JWT claim `tenant_id`
5. `req.authUser.sub`, a single user tenancy fallback so isolation
   degrades safely when an issuer has not added a tenant claim.

The header `x-tenant-id` is consulted only in non production environments
and only when no JWT tenant claim is present. It never overrides an
authenticated claim.

Two helpers are added to the Fastify instance:

- `app.requireTenant()` returns a preHandler that runs `authenticate`
  then asserts `req.tenantId` is resolved. Missing tenant returns `403`
  with `error.code = 'tenant_required'`.
- `app.assertTenantOwns(req, ownerTenantId)` compares a row's tenant
  against the caller and returns a boolean. Both helpers increment the
  Prometheus counter `http_tenant_access_denied_total{route,reason}`
  where `reason` is one of `missing` or `mismatch`, so cross tenant
  access attempts are observable in dashboards without log scraping.

Applied to:

- `GET /me/export` and `DELETE /me` use `requireTenant` and then call
  `assertTenantOwns` against the resolved user id, so a token whose
  tenant claim points elsewhere cannot exfiltrate or erase another
  user's data even when the JWT itself verifies.

New tenant scoped routes should compose `app.requireTenant()` into
their `preHandler` chain and filter persistence calls on `req.tenantId`
rather than trusting any client supplied identifier. Coverage lives in
`apps/api/tests/tenant.test.ts`.

### Configuration validation

Every API process validates its environment at boot with a zod schema in
`apps/api/src/env.ts`. The process exits with a non-zero status and a list
of problems if anything is wrong, so a misconfigured deployment never starts
serving traffic with unsafe defaults.

General checks:

- `NODE_ENV` must be `development`, `test`, or `production`.
- `PORT` is coerced to an integer in `1..65535`.
- `LOG_LEVEL` must be a known pino level.
- `WEB_ORIGIN` must be a valid URL.
- `SENTRY_TRACES_SAMPLE_RATE` must be in `[0, 1]`.
- Whitespace is trimmed from string values before validation.

Additional production rails (`NODE_ENV=production`):

- `JWT_SECRET` must be at least 32 characters and must not be the dev
  placeholder.
- `WEB_ORIGIN` must be `https://` and must not resolve to `localhost`,
  `127.0.0.1`, or `0.0.0.0`. Cluster-internal hosts ending in
  `.cluster.local` are allowed over http for service-to-service traffic.
- `ADMIN_TOKEN`, when set, must be at least 24 characters so a weak token
  cannot become the only protection on `/admin/audit`.

The loader aggregates every problem into a single error block so an operator
gets the full diff in one boot log line instead of fixing one variable at a
time. To probe the schema from a script or test without touching
`process.env`, import `parseEnv` from `apps/api/src/env.ts` and pass an
object. See `apps/api/tests/env.test.ts` for the full contract.

### API documentation

The API publishes its contract as a live OpenAPI 3.0 document built from
the Fastify route schemas at boot.

- `GET /openapi.json` returns the raw OpenAPI 3.0 document. It is always
  exposed and unauthenticated, so external partners and codegen tools
  (openapi-typescript, openapi-generator, Postman import) can consume a
  stable contract that always matches the deployed binary.
- `GET /docs` serves an interactive Swagger UI. "Try it out" is enabled
  and authorisation persists across reloads, so QA and on-call can paste
  a JWT once and exercise any route. The UI can be disabled per
  environment with `OPENAPI_UI_ENABLED=false` (the JSON document keeps
  working) for production deployments that prefer to publish docs only
  through an internal portal.

Both surfaces are excluded from the audit log so docs traffic does not
bury real user activity, and the bearer security scheme mirrors the
actual `Authorization: Bearer <jwt>` flow used by `app.authenticate`.

Regenerating a typed client from a running instance:

```bash
curl -s http://localhost:4000/openapi.json > openapi.json
npx openapi-typescript openapi.json -o packages/types/src/api.generated.ts
```

### Observability

The API exposes Prometheus metrics, propagates request ids, and emits
structured JSON logs in production.

- `GET /metrics` returns the standard Prometheus text exposition format. It
  includes Node.js default process metrics (CPU, memory, event loop, GC) plus
  `http_requests_total` and `http_request_duration_seconds` histograms
  labelled with `method`, `route`, and `status_code`. All series carry a
  `service="med-api"` label.
- Every response carries an `x-request-id` header. Inbound
  `x-request-id` values are honored when they match `[A-Za-z0-9._-]{1,128}`,
  otherwise a fresh UUID v4 is generated. The id is bound to the per-request
  logger, so every log line for that request carries `reqId`.
- In production (`NODE_ENV=production`) the logger emits structured JSON at
  `LOG_LEVEL` (default `info`). One `request_completed` event is logged per
  request with `reqId`, `method`, `route`, `status`, and `duration_ms`.
  `/health`, `/livez`, `/readyz`, and `/metrics` are demoted to debug so
  scrape and probe traffic does not flood dashboards.

Distributed tracing is propagated at the HTTP edge using the W3C Trace
Context specification (https://www.w3.org/TR/trace-context/). The plugin
at `apps/api/src/plugins/tracing.ts` runs on every request and:

- Parses an inbound `traceparent` header when present. A well formed header
  contributes its trace id (which the API adopts) and its span id (which
  becomes the parent of this server span). Malformed, reserved (`ff`), or
  all zero ids are rejected per spec and a fresh context is generated.
- Always mints a fresh 8 byte `span_id` so two hops never share the same
  span identifier even when they share a trace.
- Forwards an opaque `tracestate` header through unchanged when it is
  printable ASCII and at most 512 chars, so vendor specific propagation
  (Honeycomb, Datadog, Lightstep) survives the hop.
- Binds `traceId`, `spanId`, and `parentSpanId` to the per request pino
  logger. The `request_completed` event therefore carries both `reqId` and
  `traceId` so an operator can pivot between request id correlation and
  full trace correlation in the same query.
- Tags the Sentry scope with `trace_id` and `span_id`, so an exception
  captured in Sentry deep links to the trace in Tempo, Jaeger, Honeycomb,
  or any other W3C aware backend.
- Echoes the resulting `traceparent` (and any preserved `tracestate`) on
  the response so downstream services can stitch the trace forward.

This plugin deliberately does not emit OTLP spans itself. Span export is
left to an OpenTelemetry SDK or a sidecar collector. Propagation is the
piece that cannot be retrofitted without losing trace continuity for in
flight requests, so we ship it standalone with no extra dependencies.
Coverage lives in `apps/api/tests/tracing.test.ts` and exercises parsing,
context construction, and end to end HTTP propagation against the real
Fastify instance.

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: med-api
    metrics_path: /metrics
    static_configs:
      - targets: ['med-api:4000']
```

### Health and readiness

The API exposes three probe endpoints. All three are unauthenticated, fast,
and excluded from the audit log.

- `GET /livez` is the liveness probe. It returns 200 with `status: "ok"`,
  `pid`, and `uptime` (seconds) as long as the event loop is running. It
  never touches the audit log, the database, or any other external system.
  A failing liveness probe means the pod is wedged and should be killed by
  the kubelet.
- `GET /readyz` is the readiness probe. It returns 200 with
  `status: "ready"` only when the process is willing to accept new
  requests, and 503 with `status: "not_ready"` otherwise. The response
  body includes a per-check breakdown so operators can see which
  dependency is failing. Current checks:
  - `audit_log`: the directory holding `AUDIT_LOG_PATH` is writable, and
    if the file already exists it is a regular writable file.
  - `jwt_secret`: `JWT_SECRET` is set, at least 16 characters, and is not
    a `dev-secret-change-me` style placeholder when `NODE_ENV=production`.
    A failing readiness probe takes the pod out of the Service rotation but
    leaves it running so it can recover without a restart loop.
- `GET /health` is kept as a backward compatible alias for `/livez`. It
  returns the same liveness payload plus `ok: true` so existing uptime
  checks and the v0 Helm chart continue to work. New callers should
  prefer `/livez` and `/readyz`.

The shipped Helm chart wires `livenessProbe` to `/livez` and
`readinessProbe` to `/readyz` by default. Override
`livenessProbe.httpGet.path` or `readinessProbe.httpGet.path` in
`values.yaml` only if a load balancer requires a different path.

Readiness checks live in `apps/api/src/routes/health.ts` as
`runReadinessChecks()` so they can be reused from a smoke test or a
sidecar without going through HTTP.

### Deploy

- Build the API image with `docker build -f apps/api/Dockerfile .` or via
  `docker compose build api`. The Dockerfile is multi-stage and ships only
  the compiled `dist/` plus production `node_modules`.
- Required environment: `JWT_SECRET` (rotate per environment, never reuse
  `change-me`), `DATABASE_URL`, `WEB_ORIGIN`, optional `LOG_LEVEL`,
  optional `PORT` (default 4000).

### Rate limiting

Rate limits are layered, not a single global throttle. The plugin lives at
`apps/api/src/plugins/rateLimit.ts` and wraps `@fastify/rate-limit` with an
auth-aware key generator and per-route tier helper.

Key generation priority (first match wins):

1. `user:<sub>` when the request carries an authenticated `req.authUser`
   (JWT bearer or, in non-production, the dev `x-user-id` header). One
   misbehaving user cannot exhaust the budget for an entire office NAT.
2. `key:<prefix>` when an `x-api-key` header is present (per-key throttle
   for partner integrations and CLI tooling).
3. `ip:<remoteAddress>` as the unauthenticated fallback.

Tier table (max requests per window):

| Tier      | Limit      | Applied to                                                               |
| --------- | ---------- | ------------------------------------------------------------------------ |
| `default` | 200 per 1m | Every route by default                                                   |
| `auth`    | 10 per 1m  | `POST /auth/login`, `/auth/signup`, `/auth/refresh`                      |
| `export`  | 20 per 1h  | `GET /me/export`, `DELETE /me`, `GET /reports/export/{csv,pdf,json,ics}` |
| `admin`   | 60 per 1m  | `GET /admin/{users,stats,audit}`                                         |
| `heavy`   | 30 per 1m  | `POST /pills/identify`, `GET /interactions/graph`                        |

Probe and scrape endpoints (`/livez`, `/readyz`, `/health`, `/metrics`)
are allow-listed so liveness checks and Prometheus polling are never
throttled.

A breach returns `HTTP 429` with the body:

```json
{
  "error": "rate_limited",
  "message": "Too many requests. Retry after 60s.",
  "request_id": "...",
  "tier": "auth",
  "retryAfterMs": 59989
}
```

Every breach increments the Prometheus counter
`http_rate_limit_exceeded_total{tier,route}` which is exposed by `/metrics`.
A reasonable alert is `sum by (tier, route) (rate(http_rate_limit_exceeded_total[5m])) > 0.5`
on the `auth` and `export` tiers, since sustained throttling there usually
indicates credential stuffing or a runaway export script.

Adding a new tiered route from inside a route module:

```ts
app.post('/expensive-thing', {
  schema: { ... },
  config: app.rateLimitTier('heavy'),
}, handler);
```

### Kubernetes (Helm)

A production grade Helm chart for the API lives in `helm/med-api`. It
renders a Deployment, Service, ConfigMap, Secret, ServiceAccount,
HorizontalPodAutoscaler, PodDisruptionBudget, NetworkPolicy, optional
Ingress, optional ServiceMonitor, and a PersistentVolumeClaim for the
append only audit log.

Defaults that matter:

- 2 replicas, HPA min 2 / max 6 on 75% CPU and 80% memory.
- Pod runs as non root with a read only root filesystem, all capabilities
  dropped, `RuntimeDefault` seccomp, and `automountServiceAccountToken:
false`.
- Resource requests 100m / 256Mi, limits 500m / 512Mi.
- PDB `minAvailable: 1` so rolling node drains never take the service to
  zero.
- NetworkPolicy allows ingress only from the `ingress-nginx` and
  `monitoring` namespaces on port 4000, and egress only to DNS, the
  database CIDR on port 5432, and outbound HTTPS for Sentry.
- A 5Gi PVC backs `/app/data` so `AUDIT_LOG_PATH=/app/data/audit.log`
  survives pod restarts.
- Liveness and readiness probes both hit `/health`. Prometheus scrape
  annotations are set on the pod so the existing `kube-prometheus` setup
  will pick `/metrics` up automatically; flip `serviceMonitor.enabled=true`
  if you run the operator.

Install against staging:

```bash
helm upgrade --install med-api ./helm/med-api \
  --namespace med-staging --create-namespace \
  --set image.tag=$GIT_SHA \
  --set-string secrets.JWT_SECRET=$JWT_SECRET \
  --set-string secrets.DATABASE_URL=$DATABASE_URL \
  --set-string secrets.ADMIN_TOKEN=$ADMIN_TOKEN \
  --set-string secrets.SENTRY_DSN=$SENTRY_DSN
```

Install against production using an externally managed Secret (sealed
secrets, ExternalSecrets, Vault sidecar, etc.):

```bash
helm upgrade --install med-api ./helm/med-api \
  --namespace med-prod --create-namespace \
  -f helm/med-api/values-production.yaml \
  --set image.tag=$GIT_SHA
```

The chart is exercised in CI by `tests/helm-chart.test.sh`, which runs
`helm lint` and asserts that the critical enterprise resources render for
both the default and production value files.

### Scale

- The API is stateless; scale horizontally behind a load balancer. Sticky
  sessions are not required.
- Use the `http_request_duration_seconds` histogram p95 and
  `process_resident_memory_bytes` as HPA signals.

### Backup

- Postgres data lives in the `pgdata` volume in `docker-compose.yml`. In
  production take managed snapshots (RDS, Cloud SQL) plus a nightly
  `pg_dump` to object storage with at least 30 day retention.

### Audit log

Every mutating HTTP request (POST, PUT, PATCH, DELETE) and every `/auth/*`
request is appended to a tamper resistant JSONL trail.

- File location is set by `AUDIT_LOG_PATH` and defaults to `./data/audit.log`.
  In production point this at a path on a durable volume that is shipped to a
  SIEM or object store (for example a sidecar that tails the file to S3 or
  Loki). The file is opened append only and never rewritten by the API.
- Read traffic on non auth routes is not audited, keeping the log focused on
  state changes and authentication events. `/health`, `/ready`, `/metrics`,
  and `/admin/audit` itself are excluded to avoid noise and recursion.
- Each entry is one JSON object per line with `ts`, `actor` (id and role from
  the verified JWT, or null for anonymous traffic), `action`, `method`,
  `route`, `status`, `reqId`, and `ip`. The `reqId` matches the
  `x-request-id` response header so an audit entry can be joined to the
  matching log line and metrics sample.
- `GET /admin/audit` returns recent entries newest first. The endpoint is
  disabled (HTTP 503) unless `ADMIN_TOKEN` is configured, and requests must
  carry the matching `x-admin-token` header. Supported query parameters:
  `actorId`, `action`, `since`, `until`, `limit` (default 200, capped at
  1000). Limit and rotate the token like any other production secret.
- The audit file is excluded by `.gitignore` (`*.log`). Ensure the deployment
  volume hosting `AUDIT_LOG_PATH` is backed up alongside the database; the
  audit trail is the source of truth for who did what when.

### Data lifecycle

GDPR-style export and erasure endpoints are exposed on `/me`. Identity is
taken from the verified JWT subject when a bearer token is present, and
falls back to the `x-user-id` header for local development and CLI scripts
in line with the rest of the API.

- `GET /me/export` returns a JSON bundle of every audit trail entry
  attributed to the caller plus the caregiver shares the caller has
  issued, sent with an `attachment` content disposition so a browser
  saves it as `med-tracker-export-<userId>.json`. The bundle has a
  `schemaVersion` field (currently `2`) so downstream parsers can evolve.
  Up to 1000 most recent audit entries are included; deployments with
  heavier audit volume should back the export with an async job queue
  and object storage. Caregiver shares are returned with only the last
  16 chars of the current token signature, never the raw token bytes
  (which the server does not retain).
- `DELETE /me` purges every audit entry attributed to the caller via
  `AuditService.purgeActor`, which rewrites the JSONL log atomically
  through a sibling temp file and a rename, then purges every caregiver
  share owned by the caller via `CaregiverService.purgeUser` so any
  outstanding share tokens immediately fail verification with
  `unknown_share`. The route then appends a single `me.delete` tombstone
  entry recording the deletion (actor, audit entries removed, caregiver
  shares removed, timestamp) so an operator can later prove the request
  was honoured without retaining the user's prior activity.
- Both endpoints require an authenticated caller and return 401 otherwise.
  Unparseable lines in the audit log are preserved during a purge so data
  the platform cannot attribute is never destroyed silently.
- When a future Prisma-backed deployment adds further per-user rows
  (notifications, subscriptions, shared views), fan the deletion out
  from `DELETE /me` alongside the existing audit log and caregiver share
  purges so erasure stays exhaustive.

### Error tracking

Unhandled exceptions in route handlers are captured by a single Fastify
error handler that ships them to Sentry when configured. When Sentry is
disabled the handler still normalises responses so clients always receive a
consistent error envelope.

- Set `SENTRY_DSN` to enable. `SENTRY_ENVIRONMENT` defaults to `NODE_ENV`,
  and `SENTRY_RELEASE` should be set to your build SHA so source maps and
  regressions can be tracked. `SENTRY_TRACES_SAMPLE_RATE` defaults to `0`
  (errors only, no performance traces). Leave `SENTRY_DSN` empty in dev and
  CI so no network calls are made.
- Captured events are tagged with `request_id`, `http.method`, and
  `http.route`. When the request carries a verified JWT the user id and
  email are attached to the Sentry scope. The original error stack and the
  request URL go into the `request` context.
- Response envelope for 500s is `{ error: "internal_server_error",
message: "Internal server error", request_id }`. The original error
  message is logged at error level with the request id but never returned
  to the client, so internal stack details cannot leak via responses.
- 4xx errors (validation, auth, not found) are passed through with their
  original message and are not sent to Sentry, keeping the issue stream
  focused on real server faults.
- During graceful shutdown the API waits up to 2 seconds for in-flight
  Sentry events to flush before the process exits, so the last burst of
  errors before a SIGTERM is not lost.

### On-call

- Primary alerts: `up{job="med-api"} == 0` for 2 minutes, p95 of
  `http_request_duration_seconds` over 1s for 5 minutes, sustained
  `http_requests_total{status_code=~"5.."}` rate above baseline.
- Use the `reqId` from the `x-request-id` response header to correlate a
  user-reported failure with API logs.

### Container images

Both services ship as hardened multi-stage Alpine images. The runner
stage carries only compiled output plus pruned production `node_modules`,
so dev tooling (vitest, tsx, typescript, eslint) never reaches
production.

Shared properties (`apps/api/Dockerfile`, `apps/web/Dockerfile`):

- Four named stages: `base`, `deps`, `build`, `runner` (the API adds
  `prod-deps` so dev dependencies are pruned cleanly before copy).
- Pinned `NODE_VERSION` and `PNPM_VERSION` build args. pnpm is activated
  through corepack so the lockfile version is honoured.
- Non-root execution. A `med` user and group are created with uid/gid
  `10001` and own every file copied into `/app`. The Helm chart enforces
  the same uid via `podSecurityContext.runAsUser`.
- `tini` is installed and declared as `ENTRYPOINT`, so the Node process
  runs under PID 1 with proper SIGTERM forwarding and zombie reaping
  during rolling restarts.
- `HEALTHCHECK` calls the service's liveness path (`/livez` for API,
  `/` for web) every 30 seconds with a 5 second timeout. Docker engines
  and orchestrators that respect `HEALTHCHECK` will mark the container
  unhealthy without external probes.
- `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1` (web), and
  `NODE_OPTIONS=--enable-source-maps` (api) are set in the runner stage.
- OpenContainers (`org.opencontainers.image.*`) labels are attached for
  registry metadata.

The API runner declares `VOLUME /app/data` for the append-only audit log.
This is the only path expected to be writable at runtime, which is
compatible with `readOnlyRootFilesystem: true` in the Helm chart's
`securityContext`.

Build context lives at the repo root. A repo-level `.dockerignore`
excludes `**/node_modules`, `.env*` (except `.env.example`), `.git`,
build artefacts, tests, docs, and Helm so the context stays small and
secrets cannot leak into image layers.

Build locally:

```bash
docker build -f apps/api/Dockerfile -t med-tracker-api:dev .
docker build -f apps/web/Dockerfile -t med-tracker-web:dev .
```

Or build the whole stack via compose:

```bash
docker compose build
docker compose up
```

The Dockerfiles are statically linted in CI by `tests/dockerfile.test.sh`,
which asserts the multi-stage layout, non-root user, healthcheck, tini
entrypoint, production `NODE_ENV`, OCI labels, and `.dockerignore`
coverage. When `hadolint` is available on the runner it is also invoked
for syntax-level checks. The check runs as the `dockerfile-lint` job in
`.github/workflows/ci.yml`.

## License

MIT. See [LICENSE](LICENSE).
