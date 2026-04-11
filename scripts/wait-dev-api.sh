#!/usr/bin/env bash
# Wait until the API accepts connections before starting Vite (avoids ECONNREFUSED on /api proxy).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/server/.env"
PORT=5000
if [[ -f "$ENV_FILE" ]]; then
  line="$(grep -E '^[[:space:]]*PORT=' "$ENV_FILE" | tail -n 1 || true)"
  if [[ -n "${line}" ]]; then
    val="${line#*=}"
    val="${val//\"/}"
    val="${val//\'/}"
    val="$(echo "$val" | tr -d '[:space:]')"
    if [[ -n "$val" ]] && [[ "$val" =~ ^[0-9]+$ ]]; then
      PORT="$val"
    fi
  fi
fi
URL="http://127.0.0.1:${PORT}/api/healthz"
echo "[wait-dev-api] Waiting for ${URL} …"
for _ in $(seq 1 100); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "[wait-dev-api] API is up (port ${PORT})."
    exit 0
  fi
  sleep 0.2
done
echo "[wait-dev-api] Timed out after ~20s — is MongoDB running and PORT=${PORT} correct?" >&2
exit 1
