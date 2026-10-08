import { execSync } from 'child_process';
import fs from 'fs';

const helmetDetectorJs = fs.readFileSync('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js', 'utf8');
const helmetHeadVerifJs = fs.readFileSync('analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js', 'utf8');

const helmetDetectorTs = fs.readFileSync('analytics-engine/src/detectors/helmet-detector.ts', 'utf8');
const helmetHeadVerifTs = fs.readFileSync('analytics-engine/src/inference/helmet-head-verification.ts', 'utf8');

const hdJsB64 = Buffer.from(helmetDetectorJs).toString('base64');
const hhvJsB64 = Buffer.from(helmetHeadVerifJs).toString('base64');

const hdTsB64 = Buffer.from(helmetDetectorTs).toString('base64');
const hhvTsB64 = Buffer.from(helmetHeadVerifTs).toString('base64');

const remoteScript = `
set -euo pipefail

echo "=== Backing up current files in container ==="
sudo docker exec sentinel-gcp-analytics-engine cp /app/dist/analytics-engine/src/detectors/helmet-detector.js /app/dist/analytics-engine/src/detectors/helmet-detector.js.bak.$(date +%s)
sudo docker exec sentinel-gcp-analytics-engine cp /app/dist/analytics-engine/src/inference/helmet-head-verification.js /app/dist/analytics-engine/src/inference/helmet-head-verification.js.bak.$(date +%s)

echo "=== Writing updated JS files to container ==="
echo "${hdJsB64}" | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine sh -c "cat > /app/dist/analytics-engine/src/detectors/helmet-detector.js"
echo "${hhvJsB64}" | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine sh -c "cat > /app/dist/analytics-engine/src/inference/helmet-head-verification.js"

echo "=== Verifying syntax inside container ==="
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/detectors/helmet-detector.js
sudo docker exec sentinel-gcp-analytics-engine node --check /app/dist/analytics-engine/src/inference/helmet-head-verification.js

echo "=== Updating source root files on host ==="
if [ -d /opt/sentinel-grid/analytics-engine/src/detectors ]; then
  echo "${hdTsB64}" | base64 -d | sudo tee /opt/sentinel-grid/analytics-engine/src/detectors/helmet-detector.ts > /dev/null
fi
if [ -d /opt/sentinel-grid/analytics-engine/src/inference ]; then
  echo "${hhvTsB64}" | base64 -d | sudo tee /opt/sentinel-grid/analytics-engine/src/inference/helmet-head-verification.ts > /dev/null
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

echo "=== Testing live test frame with updated code ==="
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'TESTJS'
import fs from 'fs';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference, loadObjectInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';

const buf = fs.readFileSync('/tmp/pilot_test_ch8.rgb');
const manager = getModelManager();
await manager.initialize();

const personDetector = await loadObjectInference('yolov8n', 0.25);
const classifier = await loadHelmetClassificationInference('helmet');
const localizer = await loadObjectInference('helmet-head-localizer', 0.25);
const headClassifier = await loadHelmetClassificationInference('helmet-head-evidence');

const frame = {
  cameraId: 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda',
  tenantId: '00000000-0000-4000-8000-000000000001',
  timestamp: new Date(),
  imageData: buf,
  width: 640,
  height: 360,
  metadata: {}
};

const persons = await personDetector.run(frame);
console.log('Person detector objects:', JSON.stringify(persons));

const verifier = new LocalizedHelmetHeadVerifier(localizer, classifier, null, null, headClassifier, new Set(['*']));
console.log('usesHeadEvidence:', verifier.usesHeadEvidence(frame));

for (const p of persons.filter(x => x.label === 'person')) {
  console.log('Testing person:', p);
  const vResult = await verifier.verify(frame, p.boundingBox, 0.8);
  console.log('Verifier result:', vResult);
}

const helmetDetector = new HelmetDetector(null, 0.88, classifier, false, verifier);
await helmetDetector.initialize();
const frameWithDetections = {
  ...frame,
  metadata: { detections: persons }
};
const results = await helmetDetector.detect(frameWithDetections);
console.log('Helmet detector results on test frame:', JSON.stringify(results, null, 2));
TESTJS
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${b64}' | base64 -d | bash"`;

console.log("Deploying walking helmet fix to GCP kryptovision-server...");
console.log(execSync(cmd, { encoding: 'utf8' }));
