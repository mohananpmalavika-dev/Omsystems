import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('📦 Packaging compiled helmet fix files...');

const detectorJs = fs.readFileSync('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js', 'utf8');
const verifierJs = fs.readFileSync('analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js', 'utf8');

const detectorB64 = Buffer.from(detectorJs).toString('base64');
const verifierB64 = Buffer.from(verifierJs).toString('base64');

console.log('🚀 Transferring to GCP VM kryptovision-server...');

const remoteScript = `
set -euo pipefail

echo "Writing updated dist files..."
sudo mkdir -p /tmp/helmet-fix/detectors /tmp/helmet-fix/inference
echo "${detectorB64}" | base64 -d | sudo tee /tmp/helmet-fix/detectors/helmet-detector.js >/dev/null
echo "${verifierB64}" | base64 -d | sudo tee /tmp/helmet-fix/inference/helmet-head-verification.js >/dev/null

echo "Copying to running sentinel-gcp-analytics-engine container..."
sudo docker cp /tmp/helmet-fix/detectors/helmet-detector.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker cp /tmp/helmet-fix/inference/helmet-head-verification.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "Committing updated container image as sentinel-gcp-analytics-engine:latest..."
sudo docker commit sentinel-gcp-analytics-engine sentinel-gcp-analytics-engine:latest >/dev/null

echo "Recreating container with updated docker-compose.gcp.yml settings (HELMET_FAST_ALERT=false, HELMET_CONFIDENCE_THRESHOLD=0.85)..."
cd /opt/sentinel-grid/deploy/gcp
sudo docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine

echo "Waiting for analytics-engine to be healthy..."
sleep 5
for i in $(seq 1 15); do
  if sudo docker exec sentinel-gcp-analytics-engine wget -qO- http://127.0.0.1:8092/health >/dev/null 2>&1; then
    echo "Analytics engine is healthy!"
    break
  fi
  echo "Waiting ($i)..."
  sleep 2
done

echo "Checking environment variables in container:"
sudo docker exec sentinel-gcp-analytics-engine env | grep -E "HELMET|POSE|FACE"

echo "Checking health response:"
sudo docker exec sentinel-gcp-analytics-engine wget -qO- http://127.0.0.1:8092/health
echo ""
`;

const b64Script = Buffer.from(remoteScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64Script} | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
