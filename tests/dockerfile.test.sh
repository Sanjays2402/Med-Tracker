#!/usr/bin/env bash
# Static lint of the production Dockerfiles. Runs in CI without a Docker
# daemon. Asserts the hardening guarantees we depend on in the Helm chart
# and in the SECURITY runbook:
#
#   - multi-stage (base/deps/build/runner) so dev deps never ship
#   - non-root USER directive (uid 10001)
#   - HEALTHCHECK present
#   - tini installed and used as ENTRYPOINT (PID 1 signal forwarding)
#   - NODE_ENV=production set in the runner stage
#   - OCI image labels present
#
# If `hadolint` is on PATH it is also run for syntax-level checks. Missing
# hadolint is treated as a soft skip so contributors are not forced to
# install it locally.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

check_dockerfile() {
  local file="$1" label="$2"
  [ -f "$file" ] || fail "$label missing: $file"

  grep -qE '^FROM .* AS base'    "$file" || fail "$label: missing 'AS base' stage"
  grep -qE '^FROM .* AS deps'    "$file" || fail "$label: missing 'AS deps' stage"
  grep -qE '^FROM .* AS build'   "$file" || fail "$label: missing 'AS build' stage"
  grep -qE '^FROM .* AS runner'  "$file" || fail "$label: missing 'AS runner' stage"
  ok "$label: multi-stage layout present"

  grep -qE '^USER med'           "$file" || fail "$label: must run as non-root user 'med'"
  grep -qE 'adduser .* -u 10001' "$file" || fail "$label: must create uid 10001"
  ok "$label: non-root user (uid 10001)"

  grep -qE '^HEALTHCHECK'        "$file" || fail "$label: missing HEALTHCHECK directive"
  ok "$label: HEALTHCHECK present"

  grep -qE 'apk add .*tini'      "$file" || fail "$label: must install tini"
  grep -qE '^ENTRYPOINT .*tini'  "$file" || fail "$label: tini must be the entrypoint"
  ok "$label: tini wired as PID 1"

  grep -qE 'NODE_ENV=production' "$file" || fail "$label: NODE_ENV=production must be set in runner"
  ok "$label: NODE_ENV=production"

  grep -qE 'org\.opencontainers\.image\.title' "$file" || fail "$label: missing OCI title label"
  ok "$label: OCI labels present"
}

check_dockerfile "$ROOT/apps/api/Dockerfile" "apps/api/Dockerfile"
check_dockerfile "$ROOT/apps/web/Dockerfile" "apps/web/Dockerfile"

# .dockerignore must exclude node_modules and .env, otherwise the build
# context balloons and secrets risk leaking into the image.
DI="$ROOT/.dockerignore"
[ -f "$DI" ] || fail ".dockerignore missing at repo root"
grep -qE '^\*\*/node_modules$' "$DI" || fail ".dockerignore must exclude **/node_modules"
grep -qE '^\.env$|^\*\*/\.env$'  "$DI" || fail ".dockerignore must exclude .env"
grep -qE '^\.git$|^\*\*/\.git$'  "$DI" || fail ".dockerignore must exclude .git"
ok ".dockerignore covers node_modules, .env, .git"

if command -v hadolint >/dev/null 2>&1; then
  echo "==> hadolint apps/api/Dockerfile"
  hadolint "$ROOT/apps/api/Dockerfile" || fail "hadolint failed on api Dockerfile"
  echo "==> hadolint apps/web/Dockerfile"
  hadolint "$ROOT/apps/web/Dockerfile" || fail "hadolint failed on web Dockerfile"
else
  echo "hadolint not installed; skipping syntax lint (soft pass)"
fi

echo "Dockerfile hardening checks passed."
