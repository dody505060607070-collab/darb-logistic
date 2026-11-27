#!/usr/bin/env bash
# Encrypted, Darb-only backup of the self-hosted Supabase DB/storage and Evolution state.
# It does not back up or inspect any other Docker project.
set -euo pipefail
umask 077

: "${DARB_REPO_ROOT:?}"
: "${DARB_SUPABASE_DIR:?}"
: "${DARB_CONFIG_DIR:?}"
: "${DARB_BACKUP_PASSPHRASE:?Set a one-time backup encryption passphrase outside the repository}"
BACKUP_DIR=${DARB_BACKUP_DIR:-/opt/darb/backups}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d "$BACKUP_DIR/.darb-backup.XXXXXX")
trap 'rm -rf "$work"' EXIT

set -a
. "$DARB_CONFIG_DIR/compose.env"
. "$DARB_CONFIG_DIR/.env.evolution"
set +a
SUPABASE_DOCKER_DIR="$DARB_SUPABASE_DIR/docker"
COMPOSE=(docker compose -p darb --env-file "$SUPABASE_DOCKER_DIR/.env" -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" -f "$DARB_REPO_ROOT/ops/hostinger/compose.darb.yml")

"${COMPOSE[@]}" exec -T db pg_dumpall -U postgres --globals-only > "$work/supabase-globals.sql"
"${COMPOSE[@]}" exec -T db pg_dump -U postgres -d postgres --format=custom > "$work/supabase-database.dump"
"${COMPOSE[@]}" exec -T evolution-db sh -c 'pg_dumpall -U "$POSTGRES_USER"' > "$work/evolution-database.sql"

if [ -d "$SUPABASE_DOCKER_DIR/volumes/storage" ]; then
  tar -czf "$work/supabase-storage.tar.gz" -C "$SUPABASE_DOCKER_DIR/volumes" storage
else
  echo "Supabase storage volume path missing; refusing an incomplete backup." >&2
  exit 1
fi

docker run --rm -v darb_evolution_instances:/source:ro -v "$work":/backup alpine:3.22 \
  tar -czf /backup/evolution-instances.tar.gz -C /source .
cp "$SUPABASE_DOCKER_DIR/.env" "$work/supabase.env"
cp "$DARB_CONFIG_DIR/.env.darb" "$work/darb.env"
cp "$DARB_CONFIG_DIR/.env.evolution" "$work/evolution.env"
cp "$DARB_CONFIG_DIR/compose.env" "$work/compose.env"
chmod 600 "$work"/*

tar -czf "$work/archive.tar.gz" -C "$work" \
  supabase-globals.sql supabase-database.dump evolution-database.sql \
  supabase-storage.tar.gz evolution-instances.tar.gz \
  supabase.env darb.env evolution.env compose.env

openssl enc -aes-256-cbc -pbkdf2 -salt -in "$work/archive.tar.gz" \
  -out "$BACKUP_DIR/darb-$stamp.tar.gz.enc" -pass env:DARB_BACKUP_PASSPHRASE
chmod 600 "$BACKUP_DIR/darb-$stamp.tar.gz.enc"
sha256sum "$BACKUP_DIR/darb-$stamp.tar.gz.enc" > "$BACKUP_DIR/darb-$stamp.tar.gz.enc.sha256"
chmod 600 "$BACKUP_DIR/darb-$stamp.tar.gz.enc.sha256"
echo "Encrypted Darb backup created: darb-$stamp.tar.gz.enc"
