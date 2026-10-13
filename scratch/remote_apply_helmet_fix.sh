#!/bin/bash
set -euo pipefail

echo "== 1. Extracting /tmp/helmet-fix.tar.gz =="
mkdir -p /tmp/helmet-fix
tar -xzf /tmp/helmet-fix.tar.gz -C /tmp/helmet-fix
ls -la /tmp/helmet-fix/detectors /tmp/helmet-fix/inference

echo "== 2. Copying to container =="
docker cp /tmp/helmet-fix/detectors/helmet-detector.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/detectors/helmet-detector.js
docker cp /tmp/helmet-fix/inference/helmet-head-verification.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "== 3. Copying to host repo =="
mkdir -p /opt/sentinel-grid/analytics-engine/dist/analytics-engine/src/detectors /opt/sentinel-grid/analytics-engine/dist/analytics-engine/src/inference
cp /tmp/helmet-fix/detectors/helmet-detector.js /opt/sentinel-grid/analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js
cp /tmp/helmet-fix/inference/helmet-head-verification.js /opt/sentinel-grid/analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "== 4. Committing container image =="
docker commit sentinel-gcp-analytics-engine sentinel-gcp-analytics-engine:latest

echo "== 5. Recreating container with new compose env =="
cd /opt/sentinel-grid/deploy/gcp
docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate analytics-engine

echo "== 6. Waiting for healthy =="
sleep 6
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec sentinel-gcp-analytics-engine wget -qO- http://127.0.0.1:8092/health >/dev/null 2>&1; then
    echo "Container is healthy!"
    break
  fi
  sleep 2
done

echo "== 7. Verified Environment in Container: =="
docker exec sentinel-gcp-analytics-engine env | grep -E "HELMET|POSE|FACE"

echo "== 8. Verified Health API: =="
docker exec sentinel-gcp-analytics-engine wget -qO- http://127.0.0.1:8092/health
echo ""
echo "SUCCESS!"
