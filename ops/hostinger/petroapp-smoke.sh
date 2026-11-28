#!/usr/bin/env bash
# Explicit read-only upstream check. GET /health calls the captured PetroApp read endpoint.
set -euo pipefail
umask 077

[ "${DARB_CONFIRM_PETROAPP_LIVE_READ:-}" = "YES" ] || {
  echo "Set DARB_CONFIRM_PETROAPP_LIVE_READ=YES to run the real, read-only PetroApp health check."
  exit 2
}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"
set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb-logistic-prod --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

# The token stays inside the app container environment; it is never printed or passed as a shell argument.
"${COMPOSE[@]}" exec -T app node --input-type=module - <<'NODE'
const token = process.env.PETROAPP_RAE_BRIDGE_TOKEN;
if (!token) throw new Error("PETROAPP_RAE_BRIDGE_TOKEN is not configured");
const live = await fetch("http://petroapp-bridge:8080/livez", { signal: AbortSignal.timeout(5000) });
console.log("bridge /livez:", live.status);
if (!live.ok) process.exit(1);
const health = await fetch("http://petroapp-bridge:8080/health", {
  headers: { Authorization: "Bearer " + token },
  signal: AbortSignal.timeout(25000),
});
console.log("bridge /health (read-only upstream check):", health.status);
if (!health.ok) {
  const body = await health.json().catch(() => ({}));
  console.log("sanitized error code:", String(body.error || "unknown").slice(0, 80));
  process.exit(1);
}
const body = await health.json().catch(() => ({}));
if (body.ok !== true) process.exit(1);
console.log("PetroApp upstream health: OK");
NODE
