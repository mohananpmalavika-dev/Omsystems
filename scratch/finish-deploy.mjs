import { runRemote } from './remote-exec.mjs';

const cmd = `
set -euo pipefail

echo "=== Verifying deployed code in sentinel-gcp-analytics-engine ==="
sudo docker exec sentinel-gcp-analytics-engine grep -n "PERSON_CONFIDENCE" /app/dist/analytics-engine/src/detectors/helmet-detector.js | head -n 3
sudo docker exec sentinel-gcp-analytics-engine grep -n "HELMET_WORN_ALERT_CONFIDENCE" /app/dist/analytics-engine/src/detectors/helmet-detector.js | head -n 3

echo "=== Restarting sentinel-gcp-analytics-engine ==="
sudo docker restart sentinel-gcp-analytics-engine

echo "=== Waiting for health check ==="
for i in $(seq 1 30); do
  if sudo docker exec sentinel-gcp-analytics-engine node -e '
    fetch("http://localhost:8092/health").then(r => r.json()).then(h => {
      if (h.aiState === "AI_OPERATIONAL" && h.pipeline?.detectors?.helmet?.status === "healthy") {
        console.log("HEALTH_OK:", JSON.stringify({ aiState: h.aiState, helmet: h.pipeline?.detectors?.helmet }));
        process.exit(0);
      }
      process.exit(1);
    }).catch(() => process.exit(1));
  ' 2>/dev/null; then
    echo "Analytics engine is healthy!"
    break
  fi
  sleep 2
done
`;

console.log(runRemote(cmd));
