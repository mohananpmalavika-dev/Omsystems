#!/usr/bin/env bash
# Execute only after approval to deploy the reviewed code-only package.
set -Eeuo pipefail
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-helmet-missed-1.2.1-20261006
source_root=/opt/sentinel-grid
archive=/tmp/helmet-missed-code-1.2.1-20261006.tar.gz
candidate=sentinel-gcp-analytics-engine:helmet-missed-1.2.1-20261006
backup=sentinel-gcp-analytics-engine:before-helmet-missed-1.2.1-20261006

test -f "$archive"
echo '8b1f24bfbe2a2e0afebf08222a48665c621ed00212886cfcf2153b6746af1aee  '"$archive" | sha256sum -c -
test ! -e "$stage"
mkdir -p "$stage"
tar xzf "$archive" -C "$stage"
echo 'a84ca14996dd9399e8ff4b43fb69917cfddfa03acf4517333d409e337b63d87f  '"$stage/helmet-detector.js" | sha256sum -c -
echo '637f21749b42ee5a706b6369c0499bc2ececb57729d14ef5e6550fbc650a06af  '"$stage/helmet-head-verification.js" | sha256sum -c -
sudo docker exec "$target" node --input-type=module -e 'import fs from "node:fs";const code=fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8");if(!code.includes("super(\"helmet\", \"1.2.0\")"))throw new Error("Unexpected live detector version; stop deployment");'
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "${image_tag#sha256:}" = "$image_tag"
sudo docker tag "$old_image" "$backup"
cp "$source_root/analytics-engine/src/detectors/helmet-detector.ts" "$stage/helmet-detector.before.ts"
cp "$source_root/analytics-engine/src/inference/helmet-head-verification.ts" "$stage/helmet-head-verification.before.ts"
printf '%s\n' "$old_image" "$image_tag" > "$stage/image-before.txt"
printf '%s\n' "FROM $backup" \
  'COPY helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js' \
  'COPY helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js' > "$stage/Dockerfile"
sudo docker build -t "$candidate" "$stage"
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js
sudo docker run --rm --entrypoint node --volumes-from "$target":ro -e MODELS_DIR=/app/models "$candidate" --input-type=module -e '
import {HelmetDetector} from "/app/dist/analytics-engine/src/detectors/helmet-detector.js";
const detector=new HelmetDetector();await detector.initialize();
if(detector.getHealth().status!=="healthy")throw new Error("Candidate helmet models unavailable");
console.log("Candidate helmet model initialization passed");await detector.cleanup();process.exit(0);'
test "$(sudo docker inspect "$target" --format '{{.Image}}')" = "$old_image"
rollback() {
  sudo docker tag "$old_image" "$image_tag"
  sudo cp "$stage/helmet-detector.before.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
  sudo cp "$stage/helmet-head-verification.before.ts" "$source_root/analytics-engine/src/inference/helmet-head-verification.ts"
  cd "$source_root/deploy/gcp"
  sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
}
trap rollback ERR
sudo docker tag "$candidate" "$image_tag"
sudo cp "$stage/helmet-detector.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$stage/helmet-head-verification.ts" "$source_root/analytics-engine/src/inference/helmet-head-verification.ts"
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ready=false
for attempt in $(seq 1 24); do
  if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy"||h.notifications?.status!=="operational")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,notifications:h.notifications}));' 2>/dev/null; then ready=true;break;fi
  sleep 2
done
test "$ready" = true
sudo docker cp "$target":/app/dist/analytics-engine/src/detectors/helmet-detector.js "$stage/helmet-detector.active.js"
sudo docker cp "$target":/app/dist/analytics-engine/src/inference/helmet-head-verification.js "$stage/helmet-head-verification.active.js"
cmp "$stage/helmet-detector.js" "$stage/helmet-detector.active.js"
cmp "$stage/helmet-head-verification.js" "$stage/helmet-head-verification.active.js"
date -u > "$stage/deployed.txt"
trap - ERR
