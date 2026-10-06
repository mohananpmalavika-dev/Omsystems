#!/usr/bin/env bash
set -Eeuo pipefail
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-helmet-rajkot-1.2.2-20261006
archive=/tmp/helmet-rajkot-code-1.2.2-20261006.tar.gz
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:helmet-rajkot-1.2.2-20261006
backup=sentinel-gcp-analytics-engine:before-helmet-rajkot-1.2.2-20261006
test -f "$archive"
echo 'b3687180fd86ad72cbe7089d56c8b1b6129d9b754b516a1408edfa9b984b834e  '"$archive" | sha256sum -c -
if [ ! -e "$stage" ]; then
 mkdir -p "$stage"
 tar xzf "$archive" -C "$stage"
else
 test ! -e "$stage/deployed.txt"
fi
cd "$stage"
sha256sum -c SHA256SUMS
sudo docker exec "$target" node --input-type=module -e 'import fs from "node:fs";const s=fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8");if(!s.includes("super(\"helmet\", \"1.2.1\")"))throw new Error("Unexpected live detector version");'
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "${image_tag#sha256:}" = "$image_tag"
sudo docker tag "$old_image" "$backup"
cp "$source_root/analytics-engine/src/detectors/helmet-detector.ts" "$stage/helmet-detector.before.ts"
cp "$source_root/analytics-engine/src/inference/helmet-head-verification.ts" "$stage/helmet-head-verification.before.ts"
printf '%s\n' "$old_image" "$image_tag" > "$stage/image-before.txt"
printf '%s\n' "FROM $backup" \
 'COPY helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js' \
 'COPY helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js' \
 'COPY validate-helmet-rajkot-server-20261006.mjs /app/validate-helmet-rajkot-server-20261006.mjs' > "$stage/Dockerfile"
sudo docker build -t "$candidate" "$stage"
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js
# Reuse the running service's database access without printing credentials.
sudo docker inspect "$target" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$stage/candidate.env"
chmod 600 "$stage/candidate.env"
sudo docker inspect sentinel-gcp-control-plane --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n '/^DATABASE_URL=/p' >> "$stage/candidate.env"
grep -q '^DATABASE_URL=.' "$stage/candidate.env"
network=$(sudo docker inspect "$target" --format '{{range $name, $net := .NetworkSettings.Networks}}{{println $name}}{{end}}' | head -n 1)
test -n "$network"
sudo docker run --rm --network "$network" --volumes-from "$target":ro --env-file "$stage/candidate.env" \
 --entrypoint node "$candidate" /app/validate-helmet-rajkot-server-20261006.mjs
rm "$stage/candidate.env"
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
echo 'Detector 1.2.2 activated and verified'
