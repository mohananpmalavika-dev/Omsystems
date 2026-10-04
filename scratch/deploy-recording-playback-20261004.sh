set -Eeuo pipefail
source_root=/opt/sentinel-grid
stage=/tmp/sentinel-recording-playback-20261004
file=dashboard/components/recording-workspace.tsx
mkdir -p "$stage"
test ! -e "$stage/deployed.txt"
cd "$source_root"
test "$(sha256sum "$file" | cut -d ' ' -f1)" = 0cb286426fc1dac71d43b5a3deb6bd0240a3acf16e76329679e19bc2975328b8
cp "$file" "$stage/workspace.before.tsx"
old_image=$(sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard)
printf '%s\n' "$old_image" > "$stage/image-before.txt"
sudo docker tag "$old_image" sentinel-gcp-dashboard:before-recording-playback-20261004
rollback() {
 trap - ERR
 sudo cp "$stage/workspace.before.tsx" "$source_root/$file"
 sudo docker tag "$old_image" sentinel-gcp-dashboard:latest
 cd "$source_root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate dashboard
}
trap rollback ERR
sudo cp /tmp/recording-workspace-20261004.tsx "$file"
cd deploy/gcp
sudo docker compose -f docker-compose.gcp.yml build dashboard > "$stage/build.log" 2>&1
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps dashboard
healthy=0
for attempt in $(seq 1 30); do
 if curl --silent --fail http://127.0.0.1:10000/login >/dev/null; then healthy=1;break;fi
 sleep 2
done
test "$healthy" = 1
sudo docker inspect --format '{{.Image}}' sentinel-gcp-dashboard
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Recording search and playback dashboard correction deployed; dashboard health passed'
