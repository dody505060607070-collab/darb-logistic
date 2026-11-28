#!/usr/bin/env bash
# Start only the Darb-owned self-hosted Supabase services for a database import.
# Does not start the Darb app, Evolution API, PetroApp bridge, or scheduled jobs.
set -euo pipefail
umask 077

[ "${DARB_CONFIRM_SUPABASE_START:-}" = "YES" ] || {
  echo "Refusing to start. Set DARB_CONFIRM_SUPABASE_START=YES after the read-only VPS preflight."
  exit 2
}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"

set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb-logistic-prod --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml")

for key in DARB_SUPABASE_HTTP_BIND_PORT DARB_SUPABASE_DB_BIND_PORT DARB_SUPABASE_POOLER_BIND_PORT; do
  eval "value=\${$key:-}"
  [ -n "$value" ] || { echo "Missing required bind port: $key"; exit 2; }
done

for port in "$DARB_SUPABASE_HTTP_BIND_PORT" "$DARB_SUPABASE_DB_BIND_PORT" "$DARB_SUPABASE_POOLER_BIND_PORT"; do
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(:|\])$port$"; then
    echo "Chosen Supabase bind port $port is already listening; choose another port."
    exit 2
  fi
done

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d db auth rest realtime storage imgproxy api-gw supavisor

ready=false
for attempt in $(seq 1 60); do
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 \
    "http://127.0.0.1:$DARB_SUPABASE_HTTP_BIND_PORT/" || true)
  case "$status" in 200|301|302|401|404) ready=true; break ;; esac
  sleep 2
done
[ "$ready" = "true" ] || {
  echo "Darb Supabase API gateway did not become reachable. Other projects were not touched."
  "${COMPOSE[@]}" ps
  exit 1
}

echo "Darb-owned Supabase services are running. No application, WhatsApp, PetroApp bridge, or jobs were started."
echo "Import and verify database/Auth/Storage before setting DARB_DATA_IMPORT_COMPLETE=YES."
