#!/bin/sh
set -e
# Named volumes are created root-owned; the Node process runs as appuser (see Dockerfile.app).
# Without this, logo uploads (and other writes under uploads/backups/storage) fail with EACCES.
for d in /app/server/uploads /app/server/backups /app/server/storage; do
  mkdir -p "$d"
  chown -R appuser:appuser "$d"
done
mkdir -p /app/server/uploads/branding
chown -R appuser:appuser /app/server/uploads/branding
exec runuser -u appuser -- "$@"
