#!/usr/bin/env bash
# Prepare the official self-hosted Supabase stack for Darb in an isolated directory.
# This script downloads pinned upstream config and generates local secrets only.
# It does NOT start containers, import production data, or touch other Docker projects.
set -euo pipefail
umask 077

: "${DARB_REPO_ROOT:?Set DARB_REPO_ROOT to the Darb repository checkout}"
: "${DARB_SUPABASE_DIR:?Set DARB_SUPABASE_DIR to an empty Darb-owned directory}"
: "${DARB_CONFIG_DIR:?Set DARB_CONFIG_DIR to a Darb-owned config directory}"

UPSTREAM_REF=c78476711ef19446886630cfdf6c2a74e3912e02
mkdir -p "$DARB_SUPABASE_DIR" "$DARB_CONFIG_DIR"

if [ -f "$DARB_SUPABASE_DIR/docker/docker-compose.yml" ]; then
  echo "Supabase compose already exists; refusing to overwrite it."
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git clone --quiet --filter=blob:none --no-checkout https://github.com/supabase/supabase.git "$tmp/supabase"
git -C "$tmp/supabase" sparse-checkout init --cone
git -C "$tmp/supabase" sparse-checkout set docker
git -C "$tmp/supabase" checkout --quiet "$UPSTREAM_REF"
mkdir -p "$DARB_SUPABASE_DIR/docker"
cp -a "$tmp/supabase/docker/." "$DARB_SUPABASE_DIR/docker/"
printf '%s\n' "$UPSTREAM_REF" > "$DARB_SUPABASE_DIR/SUPABASE_UPSTREAM_REVISION"

python3 - "$DARB_SUPABASE_DIR/docker/docker-compose.yml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
text = "\n".join(line for line in text.splitlines() if "container_name:" not in line) + "\n"
replacements = {
    "      - ${API_GW_HTTP_PORT:-${KONG_HTTP_PORT:-8000}}:8000/tcp":
        '      - "127.0.0.1:${DARB_SUPABASE_HTTP_BIND_PORT:?required}:8000/tcp"',
    "      - ${POSTGRES_PORT}:5432":
        '      - "127.0.0.1:${DARB_SUPABASE_DB_BIND_PORT:?required}:5432"',
    "      - ${POOLER_PROXY_PORT_TRANSACTION}:6543":
        '      - "127.0.0.1:${DARB_SUPABASE_POOLER_BIND_PORT:?required}:6543"',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"Expected upstream port mapping not found: {old}")
    text = text.replace(old, new, 1)
p.write_text(text)
PY

if [ ! -f "$DARB_SUPABASE_DIR/docker/.env" ]; then
  cp "$DARB_SUPABASE_DIR/docker/.env.example" "$DARB_SUPABASE_DIR/docker/.env"
  (
    cd "$DARB_SUPABASE_DIR/docker"
    sh utils/generate-keys.sh --update-env >/dev/null 2>&1
    sh utils/add-new-auth-keys.sh --update-env >/dev/null 2>&1
  )
  chmod 600 "$DARB_SUPABASE_DIR/docker/.env"
fi

# Keep generated secrets private; only copy empty templates if no config exists.
for pair in ".env.darb.example:.env.darb" ".env.evolution.example:.env.evolution" "compose.env.example:compose.env"; do
  src=${pair%%:*}
  dst=${pair##*:}
  if [ ! -f "$DARB_CONFIG_DIR/$dst" ]; then
    cp "$DARB_REPO_ROOT/ops/hostinger/$src" "$DARB_CONFIG_DIR/$dst"
    chmod 600 "$DARB_CONFIG_DIR/$dst"
  fi
done

# Persist the actual isolated paths in Compose interpolation config.
python3 - "$DARB_CONFIG_DIR/compose.env" "$DARB_REPO_ROOT" "$DARB_SUPABASE_DIR" "$DARB_CONFIG_DIR" <<'PY'
from pathlib import Path
import sys
path, repo, supabase, config = sys.argv[1:]
p = Path(path)
lines = p.read_text().splitlines()
values = {"DARB_REPO_ROOT": repo, "DARB_SUPABASE_DIR": supabase, "DARB_CONFIG_DIR": config}
for key, value in values.items():
    found = False
    out = []
    for line in lines:
        if line.startswith(key + "="):
            out.append(f"{key}={value}"); found = True
        else:
            out.append(line)
    if not found: out.append(f"{key}={value}")
    lines = out
p.write_text("\n".join(lines) + "\n")
p.chmod(0o600)
PY

# Generate a new Evolution API key and matching Darb gateway key only if blank.
python3 - "$DARB_CONFIG_DIR/.env.darb" "$DARB_CONFIG_DIR/.env.evolution" <<'PY'
from pathlib import Path
import secrets, sys
app, evo = map(Path, sys.argv[1:])
def read(p):
    return p.read_text().splitlines()
def put(lines, key, value):
    out, found = [], False
    for line in lines:
        if line.startswith(key + "="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    return out
a, e = read(app), read(evo)
def value(lines, key):
    return next((line.split("=",1)[1] for line in lines if line.startswith(key+"=")), "")
api_key = value(e, "AUTHENTICATION_API_KEY") or value(a, "WHATSAPP_SERVER_KEY")
if not api_key:
    api_key = secrets.token_urlsafe(48)
db_password = value(e, "POSTGRES_PASSWORD") or secrets.token_urlsafe(36)
a = put(a, "WHATSAPP_SERVER_KEY", api_key)
e = put(e, "AUTHENTICATION_API_KEY", api_key)
e = put(e, "POSTGRES_PASSWORD", db_password)
e = put(e, "DATABASE_CONNECTION_URI", f"postgresql://evolution:{db_password}@evolution-db:5432/evolution?schema=evolution_api")
app.write_text("\n".join(a) + "\n")
evo.write_text("\n".join(e) + "\n")
bridge_token = value(a, "PETROAPP_RAE_BRIDGE_TOKEN") or secrets.token_urlsafe(48)
a = put(a, "PETROAPP_RAE_BRIDGE_TOKEN", bridge_token)
app.chmod(0o600); evo.chmod(0o600)
PY

# Copy only the generated Supabase public/secret API keys into the Darb runtime env.
# Values are never printed; the service-role secret remains on the VPS.
python3 - "$DARB_SUPABASE_DIR/docker/.env" "$DARB_CONFIG_DIR/.env.darb" <<'PY'
from pathlib import Path
import secrets, sys
supabase_env, app_env = map(Path, sys.argv[1:])
def read(p):
    return p.read_text().splitlines()
def value(lines, key):
    return next((line.split("=",1)[1] for line in lines if line.startswith(key+"=")), "")
def put(lines, key, val):
    out, found = [], False
    for line in lines:
        if line.startswith(key+"="):
            out.append(f"{key}={val}"); found = True
        else:
            out.append(line)
    if not found: out.append(f"{key}={val}")
    return out
s, a = read(supabase_env), read(app_env)
publishable = value(s, "SUPABASE_PUBLISHABLE_KEY")
secret = value(s, "SUPABASE_SECRET_KEY")
if publishable: a = put(a, "SUPABASE_PUBLISHABLE_KEY", publishable)
if secret: a = put(a, "SUPABASE_SERVICE_ROLE_KEY", secret)
if not value(a, "LOVABLE_CRON_SECRET"):
    a = put(a, "LOVABLE_CRON_SECRET", secrets.token_urlsafe(48))
app_env.write_text("\n".join(a) + "\n")
app_env.chmod(0o600)
PY

echo "Prepared Darb-owned Supabase and runtime configuration only."
echo "No containers were started; no production database or WhatsApp session was touched."
