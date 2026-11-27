#!/usr/bin/env bash
# Safe application-only deploy. It never recreates Supabase, Evolution, bridge, scheduler, or volumes.
set -euo pipefail
umask 077

image=${1:?Pass the immutable GHCR app image reference}
migration_image=${2:-}
has_migrations=${3:-false}
: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"
set -a
. "$DARB_CONFIG_DIR/compose.env"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb-logistic-prod --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

previous=""
cid=$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)
if [ -n "$cid" ]; then
  previous=$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)
fi

export DARB_APP_IMAGE="$image"
if [ "$has_migrations" = "true" ]; then
  if [ "${DARB_AUTO_MIGRATE:-false}" != "true" ]; then
    echo "Database migrations changed, but DARB_AUTO_MIGRATE is not true; refusing an app-only deploy."
    exit 2
  fi
  [ -n "$migration_image" ] || { echo "Missing immutable migration image."; exit 2; }
  if [ -f "$DARB_CONFIG_DIR/backup.env" ]; then
    set -a
    . "$DARB_CONFIG_DIR/backup.env"
    set +a
  fi
  : "${DARB_BACKUP_PASSPHRASE:?Set the encrypted backup passphrase in a protected backup.env file}"
  export DARB_MIGRATION_IMAGE="$migration_image"
  DARB_BACKUP_PASSPHRASE="$DARB_BACKUP_PASSPHRASE" bash "$DARB_REPO_ROOT/ops/hostinger/backup.sh"
  "${COMPOSE[@]}" --profile migration run --rm --no-deps migrate
fi
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
