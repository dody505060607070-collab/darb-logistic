#!/usr/bin/env bash
# Safe application-only deploy. It never recreates Supabase, Evolution, bridge, scheduler, or volumes.
set -euo pipefail
umask 077

image=${1:?Pass the immutable GHCR image reference}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"
set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

previous=""
cid=$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)
if [ -n "$cid" ]; then
  previous=$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)
fi

export DARB_APP_IMAGE="$image"
"${COMPOSE[@]}" pull app
"${COMPOSE[@]}" up -d --no-deps app

healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$DARB_APP_BIND_PORT/api/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != "true" ]; then
  echo "New Darb app image failed its health check."
  if [ -n "$previous" ]; then
    echo "Rolling back only the Darb app service to its previous image."
    export DARB_APP_IMAGE="$previous"
    "${COMPOSE[@]}" pull app
    "${COMPOSE[@]}" up -d --no-deps app
  else
    echo "No previous Darb app image exists; leaving other services untouched."
  fi
  exit 1
fi

echo "Darb app updated and healthy. No other Compose service was recreated."
