import { execSync } from 'child_process';
import fs from 'fs';

const jsContent = fs.readFileSync('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js');

console.log("=== 1. Backing up current helmet-detector.js in container ===");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-analytics-engine cp /app/dist/analytics-engine/src/detectors/helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js.bak"`,
  { stdio: 'inherit' }
);

console.log("=== 2. Streaming updated helmet-detector.js to container via stdin ===");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec -i sentinel-gcp-analytics-engine sh -c 'cat > /app/dist/analytics-engine/src/detectors/helmet-detector.js'"`,
  { input: jsContent, stdio: ['pipe', 'inherit', 'inherit'] }
);

console.log("=== 3. Verifying syntax inside container ===");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/detectors/helmet-detector.js"`,
  { stdio: 'inherit' }
);

console.log("=== 4. Verifying deployed thresholds in container ===");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-analytics-engine grep -n 'PERSON_CONFIDENCE' /app/dist/analytics-engine/src/detectors/helmet-detector.js"`,
  { stdio: 'inherit' }
);
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-analytics-engine grep -n 'HELMET_WORN_ALERT_CONFIDENCE' /app/dist/analytics-engine/src/detectors/helmet-detector.js"`,
  { stdio: 'inherit' }
);

console.log("=== 5. Restarting sentinel-gcp-analytics-engine container ===");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker restart sentinel-gcp-analytics-engine"`,
  { stdio: 'inherit' }
);

console.log("=== 6. Waiting for container health ===");
const waitScript = `
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

execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${Buffer.from(waitScript).toString('base64')}' | base64 -d | bash"`,
  { stdio: 'inherit' }
);

console.log("Deployment complete and verified!");
