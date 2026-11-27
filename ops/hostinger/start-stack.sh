#!/usr/bin/env bash
# Explicit one-time start for the isolated Darb stack. Never stops or prunes any project.
set -euo pipefail
umask 077

[ "${DARB_CONFIRM_START:-}" = "YES" ] || {
  echo "Refusing to start. Set DARB_CONFIRM_START=YES after the VPS preflight, env setup, and backup review."
  exit 2
}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"

set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

for key in DARB_APP_BIND_PORT DARB_SUPABASE_HTTP_BIND_PORT DARB_SUPABASE_DB_BIND_PORT DARB_SUPABASE_POOLER_BIND_PORT DARB_APP_IMAGE DARB_PETROAPP_BRIDGE_IMAGE EVOLUTION_API_IMAGE; do
  eval "value=\${$key:-}"
  [ -n "$value" ] || { echo "Missing required compose setting: $key"; exit 2; }
done
[ -f "$DARB_CONFIG_DIR/.env.darb" ] && [ -f "$DARB_CONFIG_DIR/.env.evolution" ] || {
  echo "Missing Darb runtime environment files."
  exit 2
}
grep -q '^WHATSAPP_INSTANCE=.' "$DARB_CONFIG_DIR/.env.darb" || {
  echo "WHATSAPP_INSTANCE must match the existing gateway instance before start."
  exit 2
}
grep -q '^PETROAPP_RAE_BRIDGE_TOKEN=.' "$DARB_CONFIG_DIR/.env.darb" || {
  echo "PETROAPP bridge credentials are incomplete."
  exit 2
}
grep -q '^AI_API_KEY=.' "$DARB_CONFIG_DIR/.env.darb" && grep -q '^AI_MODEL=.' "$DARB_CONFIG_DIR/.env.darb" || {
  echo "AI_API_KEY and AI_MODEL are required for full AI parity."
  exit 2
}
grep -q '^PETROAPP_BEARER_TOKEN=.' "$DARB_CONFIG_DIR/.env.darb" && grep -q '^PETROAPP_FINGERPRINT=.' "$DARB_CONFIG_DIR/.env.darb" || {
  echo "PetroApp source session credentials are incomplete."
  exit 2
}
python3 - "$DARB_CONFIG_DIR/.env.darb" <<'PY'
from pathlib import Path
import json, sys
lines = Path(sys.argv[1]).read_text().splitlines()
raw = next((line.split("=",1)[1] for line in lines if line.startswith("PETROAPP_PAYMENT_STATUS_MAP=")), "{}")
try:
    mapping = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit("PETROAPP_PAYMENT_STATUS_MAP is not valid JSON")
if not isinstance(mapping, dict) or not mapping:
    raise SystemExit("PETROAPP_PAYMENT_STATUS_MAP must contain exact observed source-state mappings")
if any(value not in {"completed", "cancelled"} for value in mapping.values()):
    raise SystemExit("PETROAPP_PAYMENT_STATUS_MAP values must be completed or cancelled")
PY
grep -q '^SUPABASE_PUBLISHABLE_KEY=.' "$DARB_CONFIG_DIR/.env.darb" && grep -q '^SUPABASE_SERVICE_ROLE_KEY=.' "$DARB_CONFIG_DIR/.env.darb" || {
  echo "Self-hosted Supabase API keys were not copied into Darb runtime config."
  exit 2
}
python3 - "$SUPABASE_DOCKER_DIR/.env" <<'PY'
from pathlib import Path
import sys
values = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"').strip("'")
for key in ("SUPABASE_PUBLIC_URL", "API_EXTERNAL_URL", "SITE_URL"):
    value = values.get(key, "")
    if not value.startswith("https://") or "localhost" in value or ".invalid" in value:
        raise SystemExit(f"{key} must be set to the owner-confirmed HTTPS production URL")
PY
case "$EVOLUTION_API_IMAGE" in
  *:latest|latest) echo "EVOLUTION_API_IMAGE must be pinned to the exact current Evolution version, never latest."; exit 2 ;;
esac

# Port availability check is read-only and scoped to the chosen Darb bind ports.
for port in "$DARB_APP_BIND_PORT" "$DARB_SUPABASE_HTTP_BIND_PORT" "$DARB_SUPABASE_DB_BIND_PORT" "$DARB_SUPABASE_POOLER_BIND_PORT"; do
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(:|\])$port$"; then
    echo "Chosen Darb bind port $port is already listening; choose another port."
    exit 2
  fi
done

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d
echo "Darb stack started. Scheduled jobs remain disabled; WhatsApp sending remains disabled."
