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
- `GET /me`, `PATCH /me`
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
  `/health`, `/ready`, and `/metrics` are demoted to debug so scrape and
  liveness traffic does not flood dashboards.

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: med-api
    metrics_path: /metrics
    static_configs:
      - targets: ['med-api:4000']
```

### Health and readiness

- `GET /health` is the liveness probe. It returns 200 as long as the process
  is accepting connections.
- Wire `/health` as the Kubernetes `livenessProbe` and (for now) the
  `readinessProbe`. A dedicated `/ready` that gates on database connectivity
  is tracked separately.

### Deploy

- Build the API image with `docker build -f apps/api/Dockerfile .` or via
  `docker compose build api`. The Dockerfile is multi-stage and ships only
  the compiled `dist/` plus production `node_modules`.
- Required environment: `JWT_SECRET` (rotate per environment, never reuse
  `change-me`), `DATABASE_URL`, `WEB_ORIGIN`, optional `LOG_LEVEL`,
  optional `PORT` (default 4000).
- Rate limiting is on by default at 200 req/min per IP via
  `@fastify/rate-limit`.

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

### On-call

- Primary alerts: `up{job="med-api"} == 0` for 2 minutes, p95 of
  `http_request_duration_seconds` over 1s for 5 minutes, sustained
  `http_requests_total{status_code=~"5.."}` rate above baseline.
- Use the `reqId` from the `x-request-id` response header to correlate a
  user-reported failure with API logs.

## License

MIT. See [LICENSE](LICENSE).
