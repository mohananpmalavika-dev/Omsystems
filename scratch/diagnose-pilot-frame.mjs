import { execSync } from 'child_process';

const testScript = `
import path from 'node:path';
import { loadRgbFrame } from './scripts/helmet-replay.mjs';
import { getModelManager } from './dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from './dist/analytics-engine/src/inference/configured-model-inference.js';

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false, startCleanupTimer: false });
await manager.initialize();

const objects = await loadObjectInference('yolov8n', 0.35);
const localizer = await loadObjectInference('helmet-head-localizer', 0.25);
const headClassifier = await loadHelmetClassificationInference('helmet-head-evidence');

const frame = await loadRgbFrame({
  file: '/tmp/pilot_test_ch8.rgb',
  width: 640,
  height: 360,
  capturedAt: '2026-10-08T04:56:28.652Z'
}, 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda');

const personDetections = await objects.run(frame);
console.log('--- PERSON DETECTIONS ---');
console.log(personDetections.filter(d => d.label === 'person'));

const localized = await localizer.run(frame);
console.log('--- LOCALIZER DETECTIONS (heads/helmets) ---');
console.log(localized);

for (const loc of localized) {
  const crop1 = await headClassifier.run(frame, loc.boundingBox);
  console.log('Crop on', loc.label, loc.boundingBox, '=> wearingHelmet:', crop1.wearingHelmet, 'conf:', crop1.wearingHelmetConfidence);
}

await manager.shutdown();
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
