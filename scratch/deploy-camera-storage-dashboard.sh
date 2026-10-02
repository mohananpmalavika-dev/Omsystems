#!/usr/bin/env bash
set -euo pipefail
cd /opt/sentinel-grid
files=(dashboard/app/api/operations/storage/route.ts dashboard/app/operations/storage/page.tsx)
if [ -n "$(git status --porcelain -- "${files[@]}")" ]; then
  echo 'Storage dashboard files have existing server changes; deployment stopped.' >&2
  exit 1
fi
backup=$(mktemp /tmp/camera-storage-dashboard-backup.XXXXXXXX.tar)
tar -cf "$backup" "${files[@]}"
sudo tar -xf /tmp/camera-storage-dashboard.tar
cd deploy/gcp
if ! sudo docker compose -f docker-compose.gcp.yml build dashboard; then
  cd /opt/sentinel-grid
  sudo tar -xf "$backup"
  echo 'Dashboard build failed; source restored and running dashboard retained.' >&2
  exit 1
fi
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard
echo "STORAGE_DASHBOARD_DEPLOYED backup=$backup"
