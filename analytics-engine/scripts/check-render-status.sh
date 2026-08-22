#!/bin/bash
# Check Render deployment AI engine status

echo "=== Analytics Engine Health Check ==="
echo ""

HEALTH_URL="https://kryptonvision-analytics-engine-u2sf.onrender.com/health"

echo "Fetching health status..."
curl -s $HEALTH_URL | jq '{
  status: .status,
  aiState: .aiState,
  service: .service,
  pipelineInitialized: .pipeline.initialized,
  modelsReady: .pipeline.models.ready,
  modelsLoaded: .pipeline.models.loaded,
  missingRequired: .pipeline.models.missingRequired,
  activeStreams: .streams.active
}'

echo ""
echo "=== Model Status ==="
curl -s $HEALTH_URL | jq '.pipeline.models.models[] | select(.required == true) | {
  id: .id,
  status: .status,
  path: .resolvedPath,
  reason: .reason
}'
