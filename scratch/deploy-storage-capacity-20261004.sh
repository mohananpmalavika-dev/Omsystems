set -Eeuo pipefail
source_root=/opt/sentinel-grid
stage=/tmp/sentinel-storage-capacity-20261004
file=dashboard/app/api/operations/storage/route.ts
mkdir -p "$stage"
test ! -e "$stage/deployed.txt"
cd "$source_root"
test "$(sha256sum "$file" | cut -d ' ' -f1)" = 4ecbdb5af166457a2c72d353965e3963fa66b875c66141c5f7ed4ca468f40848
cp "$file" "$stage/route.before.ts"
old_image=$(sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard)
printf '%s\n' "$old_image" > "$stage/image-before.txt"
sudo docker tag "$old_image" sentinel-gcp-dashboard:before-storage-capacity-20261004
rollback() {
 trap - ERR
 sudo cp "$stage/route.before.ts" "$source_root/$file"
 sudo docker tag "$old_image" sentinel-gcp-dashboard:latest
 cd "$source_root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate dashboard
}
trap rollback ERR
sudo cp /tmp/storage-capacity-route-20261004.ts "$file"
cd deploy/gcp
sudo docker compose -f docker-compose.gcp.yml build dashboard > "$stage/build.log" 2>&1
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard
healthy=0
for attempt in $(seq 1 30); do
 if curl --silent --fail http://127.0.0.1:10000/login >/dev/null; then healthy=1;break;fi
 sleep 2
done
test "$healthy" = 1
bash /tmp/verify-storage-summary-20261004.sh > "$stage/storage-summary.json"
cat "$stage/storage-summary.json"
sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Storage capacity correction deployed; dashboard health and authenticated inventory passed'
