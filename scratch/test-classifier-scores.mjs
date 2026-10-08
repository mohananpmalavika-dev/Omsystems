import { execSync } from 'child_process';

const testScript = `
import path from 'node:path';
import { loadRgbFrame } from './scripts/helmet-replay.mjs';
import { getModelManager } from './dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference } from './dist/analytics-engine/src/inference/configured-model-inference.js';

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false, startCleanupTimer: false });
await manager.initialize();

const helmetClassifier = await loadHelmetClassificationInference('helmet');
const headClassifier = await loadHelmetClassificationInference('helmet-head-evidence');

const frame = await loadRgbFrame({
  file: '/tmp/pilot_test_ch8.rgb',
  width: 640,
  height: 360,
  capturedAt: '2026-10-08T04:56:28.652Z'
}, 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda');

// Person bounding box:
const person = {
  x: 0.5366942699569572,
  y: 0.4289037618094047,
  width: 0.06524609593801889,
  height: 0.31088079403057534
};

const headRegion = {
  x: person.x,
  y: person.y,
  width: person.width,
  height: person.height * 0.3
};

console.log('--- TESTING HEAD REGION WITH BOTH CLASSIFIERS ---');
const r1 = await helmetClassifier.run(frame, headRegion);
console.log('EfficientNet (helmet):', r1);

const r2 = await headClassifier.run(frame, headRegion);
console.log('CLIP (helmet-head-evidence):', r2);

await manager.shutdown();
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
