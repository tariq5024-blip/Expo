#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV="$ROOT_DIR/server/.env"
SERVER_ENV_EXAMPLE="$ROOT_DIR/server/.env.example"

info() { printf '\n[dev-local] %s\n' "$1"; }
warn() { printf '\n[dev-local][warn] %s\n' "$1"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    warn "Missing required command: $1"
    exit 1
  fi
}

ensure_dep_installed() {
  local dir="$1"
  local name="$2"
  if [ ! -d "$ROOT_DIR/$dir/node_modules" ]; then
    info "$name dependencies not found. Installing..."
    npm install --prefix "$ROOT_DIR/$dir"
  fi
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$SERVER_ENV"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$SERVER_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >> "$SERVER_ENV"
  fi
}

get_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$SERVER_ENV" | head -n 1
}

mongo_reachable() {
  node -e "const net=require('net');const s=net.connect(27017,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),700);" >/dev/null 2>&1
}

try_start_mongo_service() {
  if command -v systemctl >/dev/null 2>&1; then
    if sudo -n systemctl start mongod >/dev/null 2>&1 || sudo -n systemctl start mongodb >/dev/null 2>&1; then
      info "MongoDB service start command sent."
      sleep 1
      return 0
    fi
  fi
  return 1
}

require_cmd node
require_cmd npm
require_cmd grep
require_cmd sed
require_cmd openssl

if [ ! -f "$SERVER_ENV" ]; then
  if [ -f "$SERVER_ENV_EXAMPLE" ]; then
    info "Creating server/.env from .env.example"
    cp "$SERVER_ENV_EXAMPLE" "$SERVER_ENV"
  else
    warn "Missing server/.env and server/.env.example"
    exit 1
  fi
fi

# Ensure secrets exist for local startup flows.
COOKIE_SECRET_VALUE="$(get_env_value "COOKIE_SECRET")"
if [ -z "${COOKIE_SECRET_VALUE:-}" ]; then
  upsert_env_value "COOKIE_SECRET" "$(openssl rand -hex 32)"
fi

EMAIL_KEY_VALUE="$(get_env_value "EMAIL_CONFIG_ENCRYPTION_KEY")"
if [ -z "${EMAIL_KEY_VALUE:-}" ] || [ "$EMAIL_KEY_VALUE" = "replace_with_64_hex_chars_or_base64_32_bytes" ]; then
  upsert_env_value "EMAIL_CONFIG_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
fi

RESET_SECRET_VALUE="$(get_env_value "EMERGENCY_RESET_SECRET")"
if [ -z "${RESET_SECRET_VALUE:-}" ] || [ "$RESET_SECRET_VALUE" = "replace_with_secure_random_value" ]; then
  upsert_env_value "EMERGENCY_RESET_SECRET" "$(openssl rand -hex 24)"
fi

ensure_dep_installed "server" "Server"
ensure_dep_installed "client" "Client"

if mongo_reachable; then
  info "MongoDB is reachable at 127.0.0.1:27017"
else
  warn "MongoDB is not reachable at 127.0.0.1:27017"
  if try_start_mongo_service && mongo_reachable; then
    info "MongoDB is now reachable."
  else
    warn "Could not auto-start MongoDB."
    warn "Start it manually: sudo systemctl start mongod (or mongodb)"
    warn "Frontend will still run; backend will keep retrying until MongoDB is up."
  fi
fi

info "Starting frontend + backend..."
npm run dev --prefix "$ROOT_DIR"
