import { execSync } from 'child_process';
import fs from 'fs';

const jsContent = fs.readFileSync('analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js', 'utf8');
const tsContent = fs.readFileSync('analytics-engine/src/inference/helmet-head-verification.ts', 'utf8');

const jsB64 = Buffer.from(jsContent).toString('base64');
const tsB64 = Buffer.from(tsContent).toString('base64');

const remoteScript = `
set -euo pipefail

echo "=== Backing up current file in container ==="
sudo docker exec sentinel-gcp-analytics-engine cp /app/dist/analytics-engine/src/inference/helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js.bak.$(date +%s)

echo "=== Writing updated helmet-head-verification.js to container ==="
echo "${jsB64}" | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine sh -c "cat > /app/dist/analytics-engine/src/inference/helmet-head-verification.js"

echo "=== Verifying syntax inside container ==="
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "=== Updating source root file ==="
if [ -d /opt/sentinel-grid/analytics-engine/src/inference ]; then
  echo "${tsB64}" | base64 -d | sudo tee /opt/sentinel-grid/analytics-engine/src/inference/helmet-head-verification.ts > /dev/null
fi

echo "=== Restarting sentinel-gcp-analytics-engine container ==="
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

echo "=== Verifying deployed code snippet in container ==="
sudo docker exec sentinel-gcp-analytics-engine node -e '
  const fs = require("fs");
  const code = fs.readFileSync("/app/dist/analytics-engine/src/inference/helmet-head-verification.js", "utf8");
  const idx = code.indexOf("candidates = objects.filter");
  console.log(code.substring(idx - 30, idx + 150));
'
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | bash"`;

console.log("Deploying fix to GCP...");
console.log(execSync(cmd, { encoding: 'utf8' }));
