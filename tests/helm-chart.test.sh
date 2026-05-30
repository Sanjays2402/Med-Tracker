#!/usr/bin/env bash
# Smoke test for the med-api Helm chart. Runs helm lint and helm template
# against the default and production value files and asserts that the
# critical enterprise resources are rendered (Deployment, Service, HPA,
# PodDisruptionBudget, NetworkPolicy, resource limits).
set -euo pipefail

CHART_DIR="$(cd "$(dirname "$0")/.." && pwd)/helm/med-api"

if ! command -v helm >/dev/null 2>&1; then
  echo "helm not installed; skipping chart test" >&2
  exit 0
fi

echo "==> helm lint (defaults)"
helm lint "$CHART_DIR"

echo "==> helm lint (production)"
helm lint "$CHART_DIR" -f "$CHART_DIR/values-production.yaml"

render_default=$(helm template med-api "$CHART_DIR")
render_prod=$(helm template med-api "$CHART_DIR" -f "$CHART_DIR/values-production.yaml")

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  if ! grep -q -- "$needle" <<<"$haystack"; then
    echo "FAIL: $label did not contain: $needle" >&2
    exit 1
  fi
  echo "ok: $label contains $needle"
}

echo "==> assert default render"
assert_contains "$render_default" "kind: Deployment" "default"
assert_contains "$render_default" "kind: Service" "default"
assert_contains "$render_default" "kind: HorizontalPodAutoscaler" "default"
assert_contains "$render_default" "kind: PodDisruptionBudget" "default"
assert_contains "$render_default" "kind: NetworkPolicy" "default"
assert_contains "$render_default" "kind: ConfigMap" "default"
assert_contains "$render_default" "kind: PersistentVolumeClaim" "default"
assert_contains "$render_default" "readOnlyRootFilesystem: true" "default"
assert_contains "$render_default" "runAsNonRoot: true" "default"
assert_contains "$render_default" "path: /health" "default"
assert_contains "$render_default" "path: /metrics" "default"
assert_contains "$render_default" "cpu: 500m" "default limits"

echo "==> assert production render"
assert_contains "$render_prod" "kind: Ingress" "prod"
assert_contains "$render_prod" "kind: ServiceMonitor" "prod"
assert_contains "$render_prod" "minReplicas: 3" "prod"
assert_contains "$render_prod" "maxReplicas: 12" "prod"
assert_contains "$render_prod" "name: med-api-secrets" "prod uses existingSecret"

echo "OK: chart renders enterprise resources"
