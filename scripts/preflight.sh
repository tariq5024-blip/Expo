#!/usr/bin/env bash
set -euo pipefail

# One-command local preflight for new laptops/clones.
# Usage:
#   ./scripts/preflight.sh
#   ./scripts/preflight.sh --with-verify

WITH_VERIFY=false
if [[ "${1:-}" == "--with-verify" ]]; then
  WITH_VERIFY=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

ok() { echo "[OK] $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
step() { echo; echo "==> $1"; }

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
  ok "Found command: $cmd"
}

step "Repository checks"
[[ -f "package.json" ]] || fail "Run this from repository root (missing package.json)."
[[ -f "client/package.json" ]] || fail "Missing client/package.json"
[[ -f "server/package.json" ]] || fail "Missing server/package.json"
ok "Repository layout looks good"

step "Tooling checks"
require_cmd node
require_cmd npm
require_cmd git
require_cmd docker
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is missing"
ok "Docker Compose is available"
if command -v make >/dev/null 2>&1; then
  ok "Found command: make"
else
  warn "make not found. Install with: sudo apt install -y make"
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node.js 20+ required; current: $(node -v)"
fi
ok "Node.js version is compatible: $(node -v)"

step "Dependency integrity checks"
npm ls --depth=0 >/dev/null
ok "Root dependencies are valid"
npm ls --depth=0 --prefix server >/dev/null
ok "Server dependencies are valid"
npm ls --depth=0 --prefix client >/dev/null
ok "Client dependencies are valid"

step "Code/build checks"
node --check server/server.js
ok "Backend entry syntax check passed"
npm run build --prefix client >/dev/null
ok "Frontend production build passed"

step "Deployment configuration checks"
if [[ ! -f ".env.docker" ]]; then
  if [[ -f ".env.docker.example" ]]; then
    cp .env.docker.example .env.docker
    warn "Created .env.docker from template. Set real secrets before deployment."
  else
    fail "Missing both .env.docker and .env.docker.example"
  fi
fi

make validate-prod >/dev/null
ok "Production compose config is valid"

if [[ "$WITH_VERIFY" == true ]]; then
  step "Runtime health verification"
  if ./deploy.sh verify >/dev/null; then
    ok "Live health verification passed"
  else
    fail "Live health verification failed. Start stack with ./deploy.sh safe-release and retry."
  fi
else
  step "Runtime health verification (skipped)"
  warn "Skipped live health checks. Use --with-verify if stack is running."
fi

step "Preflight result"
ok "Preflight completed successfully on this machine."
echo "Next: run ./deploy.sh safe-release (or make safe-release-prod)"
