#!/bin/sh
set -e
# Named volumes are created root-owned; the Node process runs as appuser (see Dockerfile.app).
# Without this, logo uploads (and other writes under uploads/backups/storage) fail with EACCES.
for d in /app/server/uploads /app/server/backups /app/server/storage; do
  mkdir -p "$d"
  # Some environments disallow chown on mounted volumes; continue with a warning.
  chown -R appuser:appuser "$d" 2>/dev/null || echo "warn: chown not permitted for $d; continuing"
done
# Keep startup resilient even when volume permissions are managed externally.
mkdir -p /app/server/uploads/branding 2>/dev/null || echo "warn: mkdir not permitted for /app/server/uploads/branding; continuing"
chown -R appuser:appuser /app/server/uploads/branding 2>/dev/null || echo "warn: chown not permitted for /app/server/uploads/branding; continuing"
# Some Docker environments block runuser/setgroups; run command directly for compatibility.
exec "$@"
