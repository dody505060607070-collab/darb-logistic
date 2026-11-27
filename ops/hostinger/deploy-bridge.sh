#!/usr/bin/env bash
# Safe bridge-only deploy. No live PetroApp request is made by this script.
set -euo pipefail
umask 077

image=${1:?Pass the immutable GHCR bridge image reference}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"
set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb-logistic-prod --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

previous=""
cid=$("${COMPOSE[@]}" ps -q petroapp-bridge 2>/dev/null || true)
if [ -n "$cid" ]; then
  previous=$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)
fi

export DARB_PETROAPP_BRIDGE_IMAGE="$image"
"${COMPOSE[@]}" pull petroapp-bridge
"${COMPOSE[@]}" up -d --no-deps petroapp-bridge

healthy=false
for attempt in $(seq 1 20); do
  if "${COMPOSE[@]}" exec -T petroapp-bridge python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/livez', timeout=3)" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != "true" ]; then
  echo "New PetroApp bridge image failed its local liveness check."
  if [ -n "$previous" ]; then
    echo "Rolling back only the Darb PetroApp bridge service."
    export DARB_PETROAPP_BRIDGE_IMAGE="$previous"
    "${COMPOSE[@]}" pull petroapp-bridge
    "${COMPOSE[@]}" up -d --no-deps petroapp-bridge
  else
    echo "No previous bridge image exists; other services remain untouched."
  fi
  exit 1
fi

echo "PetroApp bridge process is live. Upstream PetroApp connectivity has NOT been tested by this deployment."
