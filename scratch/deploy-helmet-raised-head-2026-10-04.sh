set -Eeuo pipefail
target=sentinel-gcp-analytics-engine
stage=/tmp/sentinel-helmet-raised-head-1.1.5-20261004
source_root=/opt/sentinel-grid
mkdir -p "$stage"
test ! -e "$stage/deployed.txt"
tar xzf /tmp/helmet-raised-head-update-20261004.tar.gz -C "$stage"
sudo docker cp "$target":/app/dist/analytics-engine/src/detectors/helmet-detector.js "$stage/helmet-detector.before.js"
grep -q 'super("helmet", "1.1.3")' "$stage/helmet-detector.before.js"
grep -q 'super("helmet", "1.1.5")' "$stage/helmet-detector.js"
old_image=$(sudo docker inspect "$target" --format '{{.Image}}')
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
test "${image_tag#sha256:}" = "$image_tag"
sudo docker tag "$old_image" sentinel-gcp-analytics-engine:before-helmet-raised-head-1.1.5-20261004
cp "$source_root/analytics-engine/src/detectors/helmet-detector.ts" "$stage/helmet-detector.before.ts"
printf '%s\n' "$old_image" "$image_tag" > "$stage/image-before.txt"
printf '%s\n' 'FROM sentinel-gcp-analytics-engine:before-helmet-raised-head-1.1.5-20261004' 'COPY helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js' > "$stage/Dockerfile"
sudo docker build -t "$image_tag" "$stage"
sudo docker run --rm --entrypoint node "$image_tag" --check /app/dist/analytics-engine/src/detectors/helmet-detector.js
rollback() {
 sudo docker tag "$old_image" "$image_tag"
 sudo cp "$stage/helmet-detector.before.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
 cd "$source_root/deploy/gcp"
 sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
}
trap rollback ERR
sudo cp "$stage/helmet-detector.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine
ready=false
for attempt in $(seq 1 24); do
 if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,notifications:h.notifications}));' 2>/dev/null; then ready=true;break;fi
 sleep 2
done
test "$ready" = true
sudo docker cp "$stage/missed-helmet.jpg" "$target":/tmp/missed-helmet-1791120703973.jpg
sudo docker exec -i "$target" node --input-type=module <<'JS'
import sharp from 'sharp';import assert from 'node:assert/strict';
import {AnalyticsPipeline} from './dist/analytics-engine/src/analytics-pipeline.js';
import {getModelManager} from './dist/analytics-engine/src/model-manager.js';
const pipeline=new AnalyticsPipeline();await pipeline.initialize();
try {
 const {data,info}=await sharp('/tmp/missed-helmet-1791120703973.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'isolated-missed-helmet-validation',tenantId:'isolated-validation',imageData:data,width:info.width,height:info.height};
 const rules=[{id:'isolated-rule',cameraId:frame.cameraId,detectionType:'helmet-worn',enabled:true,minConfidence:.7,minDurationSeconds:1}];
 const counts=[];for(const seconds of [0,0,2,4]){const events=await pipeline.processFrame({...frame,timestamp:new Date(seconds*1000)},rules);const helmets=events.filter(e=>e.detectionType==='helmet-worn');counts.push(helmets.length);console.log('ISOLATED_REPLAY',JSON.stringify({seconds,helmetEvents:helmets.map(e=>({confidence:e.confidence,version:e.modelVersion}))}));}
 assert.deepEqual(counts,[0,0,0,1]);
}finally{await pipeline.cleanup();await getModelManager().shutdown();}process.exit(0);
JS
sudo docker exec "$target" node --input-type=module -e 'import fs from "node:fs";const s=fs.readFileSync("/app/dist/analytics-engine/src/detectors/helmet-detector.js","utf8");if(!s.includes("super(\"helmet\", \"1.1.5\")"))process.exit(1);console.log("Deployed helmet detector 1.1.5");'
date -u > "$stage/deployed.txt"
trap - ERR
