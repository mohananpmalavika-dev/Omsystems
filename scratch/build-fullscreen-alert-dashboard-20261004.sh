set -Eeuo pipefail
cd /opt/sentinel-grid
grep -q '<FullscreenAlertPortal>' dashboard/components/global-alert-center.tsx
grep -q 'document.fullscreenElement ?? document.body' dashboard/components/fullscreen-alert-portal.tsx
backup=/tmp/sentinel-fullscreen-alert-dashboard-build-20261004
mkdir -p "$backup"
old_image=$(sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard)
printf '%s\n' "$old_image" > "$backup/image-before.txt"
sudo docker image tag "$old_image" sentinel-gcp-dashboard:before-fullscreen-alert-20261004
cd deploy/gcp
sudo docker compose -f docker-compose.gcp.yml build dashboard > "$backup/build.log" 2>&1 || { tail -60 "$backup/build.log"; exit 1; }
rollback() {
 trap - ERR
 sudo docker image tag "$old_image" sentinel-gcp-dashboard:latest
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate dashboard
}
trap rollback ERR
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard
healthy=0
for attempt in $(seq 1 30); do
 if curl --silent --fail http://127.0.0.1:10000/login >/dev/null; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard
date -u > "$backup/deployed.txt"
trap - ERR
echo 'Fullscreen alert dashboard activated; login health passed'
