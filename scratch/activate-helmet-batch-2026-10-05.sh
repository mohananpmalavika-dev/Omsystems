set -Eeuo pipefail
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-helmet-batch-1.1.8-20261005
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:helmet-batch-1.1.8-20261005
test -f "$stage/validated.txt"
test ! -e "$stage/deployed.txt"
test "$(grep -c '^VALIDATED ' "$stage/supplied-validation.log")" = 62
test "$(grep -c '^VALIDATED ' "$stage/original-validation.log")" = 32
test "$(sudo docker image inspect "$candidate" --format '{{.Id}}')" = "$(cat "$stage/candidate-validated.txt")"
old_image=$(sed -n '1p' "$stage/image-before.txt")
image_tag=$(sed -n '2p' "$stage/image-before.txt")
test "$(sudo docker inspect "$target" --format '{{.Image}}')" = "$old_image"
rollback() {
 sudo docker tag "$old_image" "$image_tag"
 sudo cp "$stage/helmet-detector.before.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
 cd "$source_root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
}
trap rollback ERR
sudo docker tag "$candidate" "$image_tag"
sudo cp "$stage/helmet-detector.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ready=false
for attempt in $(seq 1 24); do
 if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,notifications:h.notifications,fastAlert:process.env.HELMET_FAST_ALERT}));' 2>/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
sudo docker cp "$target":/app/dist/analytics-engine/src/detectors/helmet-detector.js "$stage/helmet-detector.active.js"
cmp "$stage/helmet-detector.js" "$stage/helmet-detector.active.js"
grep -q 'super("helmet", "1.1.8")' "$stage/helmet-detector.active.js"
sudo docker inspect "$target" --format '{{.Image}}'
date -u > "$stage/deployed.txt"
trap - ERR
