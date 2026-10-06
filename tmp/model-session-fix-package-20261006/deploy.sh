#!/usr/bin/env bash
set -Eeuo pipefail
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-model-session-fix-20261006
archive=/tmp/model-session-fix-20261006.tar.gz
source_root=/opt/sentinel-grid
candidate=sentinel-gcp-analytics-engine:model-session-fix-20261006
backup=sentinel-gcp-analytics-engine:before-model-session-fix-20261006
test -f "$archive"
test ! -e "$stage"
mkdir -p "$stage"
tar xzf "$archive" -C "$stage"
cd "$stage"
sha256sum -c SHA256SUMS
expected=$(cat baseline-source.sha256)
actual=$(sudo docker exec "$target" node --input-type=module -e 'import fs from "node:fs";import{createHash}from"node:crypto";const s=fs.readFileSync("/app/dist/analytics-engine/src/model-manager.js","utf8");if(s.includes("createModelHandle"))throw new Error("Session fix already exists; review live state before applying");console.log("baseline-runtime-unmanaged");')
test "$actual" = baseline-runtime-unmanaged
source_hash=$(sudo docker exec -i "$target" node --input-type=module -e 'import{createHash}from"node:crypto";process.stdin.setEncoding("utf8");let s="";for await(const c of process.stdin)s+=c;console.log(createHash("sha256").update(s.replaceAll("\r","").trimEnd()).digest("hex"));' < "$source_root/analytics-engine/src/model-manager.ts")
test "$source_hash" = "$expected"
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "${image_tag#sha256:}" = "$image_tag"
sudo docker tag "$old_image" "$backup"
cp "$source_root/analytics-engine/src/model-manager.ts" "$stage/model-manager.before.ts"
printf '%s\n' "$old_image" "$image_tag" > "$stage/image-before.txt"
printf '%s\n' "FROM $backup" \
 'COPY model-manager.js /app/dist/analytics-engine/src/model-manager.js' \
 'COPY validate-model-session-lifetime-20261006.mjs /app/validate-model-session-lifetime-20261006.mjs' > "$stage/Dockerfile"
sudo docker build -t "$candidate" "$stage"
sudo docker run --rm --entrypoint node "$candidate" --check /app/dist/analytics-engine/src/model-manager.js
sudo docker run --rm --network none --volumes-from "$target":ro -e MODELS_DIR=/app/models --entrypoint node \
 "$candidate" /app/validate-model-session-lifetime-20261006.mjs
test "$(sudo docker inspect "$target" --format '{{.Image}}')" = "$old_image"
rollback() {
 sudo docker tag "$old_image" "$image_tag"
 sudo cp "$stage/model-manager.before.ts" "$source_root/analytics-engine/src/model-manager.ts"
 cd "$source_root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
}
trap rollback ERR
sudo docker tag "$candidate" "$image_tag"
sudo cp "$stage/model-manager.ts" "$source_root/analytics-engine/src/model-manager.ts"
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ready=false
for attempt in $(seq 1 30); do
 if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy"||h.notifications?.status!=="operational")process.exit(1);console.log(JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,helmet:h.pipeline.detectors.helmet,notifications:h.notifications}));' 2>/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
sudo docker cp "$target":/app/dist/analytics-engine/src/model-manager.js "$stage/model-manager.active.js"
cmp "$stage/model-manager.js" "$stage/model-manager.active.js"
cmp "$stage/model-manager.ts" "$source_root/analytics-engine/src/model-manager.ts"
date -u > "$stage/deployed.txt"
trap - ERR
echo 'Managed model sessions activated and verified'
