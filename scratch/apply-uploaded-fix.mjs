import { execSync } from 'child_process';

const remoteCmd = `
set -euo pipefail

echo "=== Backing up current container file ==="
sudo docker exec sentinel-gcp-analytics-engine cp /app/dist/analytics-engine/src/inference/helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js.bak.$(date +%s)

echo "=== Copying new file into container ==="
sudo docker cp /tmp/helmet-head-verification.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "=== Checking syntax ==="
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "=== Updating source root ==="
if [ -d /opt/sentinel-grid/analytics-engine/src/inference ]; then
  sudo cp /tmp/helmet-head-verification.ts /opt/sentinel-grid/analytics-engine/src/inference/helmet-head-verification.ts
fi

echo "=== Restarting container ==="
sudo docker restart sentinel-gcp-analytics-engine

echo "=== Waiting for health check ==="
ready=false
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
    ready=true
    echo "Analytics engine is healthy!"
    break
  fi
  sleep 2
done

if [ "$ready" != "true" ]; then
  echo "Container failed to become healthy!"
  exit 1
fi

echo "=== Verifying deployed snippet ==="
sudo docker exec sentinel-gcp-analytics-engine node -e '
  const fs = require("fs");
  const code = fs.readFileSync("/app/dist/analytics-engine/src/inference/helmet-head-verification.js", "utf8");
  const idx = code.indexOf("candidates = objects.filter");
  console.log(code.substring(idx - 30, idx + 150));
'
`;

const b64 = Buffer.from(remoteCmd).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
