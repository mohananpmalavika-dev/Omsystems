#!/usr/bin/env bash
set -euo pipefail
UPLOAD_DIRECTORY=/tmp/krypton-installer-fix-20260915
REPOSITORY=/opt/sentinel-grid
cd "$REPOSITORY"
git apply --check "$UPLOAD_DIRECTORY/installer-fix.patch"
mkdir -p "$UPLOAD_DIRECTORY/backup"
docker inspect sentinel-gcp-control-plane --format '{{.Image}}' > "$UPLOAD_DIRECTORY/backup/control-plane-image"
docker inspect sentinel-gcp-dashboard --format '{{.Image}}' > "$UPLOAD_DIRECTORY/backup/dashboard-image"
docker tag "$(cat "$UPLOAD_DIRECTORY/backup/control-plane-image")" sentinel-installer-backup-control-plane:20260915
docker tag "$(cat "$UPLOAD_DIRECTORY/backup/dashboard-image")" sentinel-installer-backup-dashboard:20260915
git apply "$UPLOAD_DIRECTORY/installer-fix.patch"
cd deploy/gcp
export COMPOSE_PARALLEL_LIMIT=1
docker compose -f docker-compose.gcp.yml build control-plane
docker compose -f docker-compose.gcp.yml build dashboard
docker compose -f docker-compose.gcp.yml run --rm --no-deps -T \
  -v "$UPLOAD_DIRECTORY/verify-installed-installer.mjs:/tmp/verify-installed-installer.mjs:ro" \
  --entrypoint node control-plane /tmp/verify-installed-installer.mjs
docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate --wait --wait-timeout 180 control-plane dashboard
curl --fail --silent --show-error https://34-14-220-41.sslip.io/health
echo
echo INSTALLER_FIX_DEPLOYED
