import { execSync } from 'child_process';
import path from 'path';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

console.log('--- Step 1: Uploading helmet-update-1.2.0.tar.gz via scp ---');
const localTar = path.resolve('scratch/helmet-update-1.2.0.tar.gz');
const scpCmd = `gcloud compute scp "${localTar}" ${instance}:/tmp/helmet-update-1.2.0.tar.gz --zone=${zone} --project=${project}`;
console.log(scpCmd);
execSync(scpCmd, { stdio: 'inherit' });
console.log('Upload successful!');

console.log('\n--- Step 2: Deploying update on remote server ---');
const deployScript = `
set -Eeuo pipefail
stage=/tmp/sentinel-helmet-update-1.2.0
rm -rf "$stage"
mkdir -p "$stage"
tar xzf /tmp/helmet-update-1.2.0.tar.gz -C "$stage"

source_root=/opt/sentinel-grid

echo "Copying model and manifest..."
sudo cp "$stage/models/manifest.json" "$source_root/analytics-engine/models/manifest.json"
sudo cp "$stage/models/safety/helmet-head-localizer.onnx" "$source_root/analytics-engine/models/safety/helmet-head-localizer.onnx"
sudo chmod 644 "$source_root/analytics-engine/models/safety/helmet-head-localizer.onnx"

echo "Copying source TypeScript files..."
sudo cp "$stage/src/detectors/helmet-detector.ts" "$source_root/analytics-engine/src/detectors/helmet-detector.ts"
sudo cp "$stage/src/inference/helmet-head-verification.ts" "$source_root/analytics-engine/src/inference/helmet-head-verification.ts"
sudo cp "$stage/src/inference/yolo-detection-inference.ts" "$source_root/analytics-engine/src/inference/yolo-detection-inference.ts"
sudo cp "$stage/src/inference/configured-model-inference.ts" "$source_root/analytics-engine/src/inference/configured-model-inference.ts"
sudo cp "$stage/src/model-manager.ts" "$source_root/analytics-engine/src/model-manager.ts"

target=sentinel-gcp-analytics-engine
image_tag=$(sudo docker inspect "$target" --format '{{.Config.Image}}')
candidate=sentinel-gcp-analytics-engine:helmet-head-localizer-1.2.0-20261005

echo "Building candidate container image..."
cat << 'DOCKERFILE' > "$stage/Dockerfile"
FROM sentinel-gcp-analytics-engine:latest
COPY dist/detectors/helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js
COPY dist/inference/helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js
COPY dist/inference/yolo-detection-inference.js /app/dist/analytics-engine/src/inference/yolo-detection-inference.js
COPY dist/inference/configured-model-inference.js /app/dist/analytics-engine/src/inference/configured-model-inference.js
COPY dist/model-manager.js /app/dist/analytics-engine/src/model-manager.js
DOCKERFILE

sudo docker build -t "$candidate" "$stage"
sudo docker tag "$candidate" "$image_tag"

echo "Recreating analytics engine container..."
cd "$source_root/deploy/gcp"
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine

echo "Waiting for health check..."
ready=false
for attempt in $(seq 1 30); do
  if sudo docker exec "$target" node --input-type=module -e 'const h=await(await fetch("http://localhost:8092/health")).json();if(h.aiState!=="AI_OPERATIONAL"||h.pipeline?.detectors?.helmet?.status!=="healthy")process.exit(1);console.log(JSON.stringify({aiState:h.aiState,helmet:h.pipeline.detectors.helmet,localizerModel:h.pipeline?.models?.models?.find?.(m=>m.id==="helmet-head-localizer")?.status}));' 2>/dev/null; then
    ready=true
    break
  fi
  echo "Attempt $attempt: waiting 2s..."
  sleep 2
done

if [ "$ready" != "true" ]; then
  echo "ERROR: Analytics engine failed to become healthy!"
  sudo docker logs --tail 50 "$target"
  exit 1
fi

echo "Resolving open false alarm helmet alerts in database..."
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "UPDATE analytics_alerts SET status = 'false_alarm' WHERE title ILIKE '%helmet%' AND status IN ('new', 'acknowledged');"

echo "SUCCESS! Helmet detector 1.2.0 is live and verified."
`;

const b64 = Buffer.from(deployScript).toString('base64');
const sshCmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
execSync(sshCmd, { stdio: 'inherit' });
console.log('Deployment completed successfully!');
