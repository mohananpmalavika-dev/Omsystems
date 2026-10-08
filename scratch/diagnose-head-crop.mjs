import { execSync } from 'child_process';

const testScript = `
import path from 'node:path';
import { loadRgbFrame } from './scripts/helmet-replay.mjs';
import { getModelManager } from './dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from './dist/analytics-engine/src/inference/configured-model-inference.js';
import { cropRgb24 } from './dist/analytics-engine/src/inference/vision-specialty-inference.js';

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

const persons = (await objects.run(frame)).filter(d => d.label === 'person');
const person = persons[0].boundingBox;
console.log('Person:', person);

const left = Math.max(0, Math.floor((person.x - person.width * 0.2) * frame.width));
const top = Math.max(0, Math.floor((person.y - person.height * 0.2) * frame.height));
const right = Math.min(frame.width, Math.ceil((person.x + person.width * 1.2) * frame.width));
const bottom = Math.min(frame.height, Math.ceil((person.y + person.height * 0.45) * frame.height));

const region = { x: left/frame.width, y: top/frame.height, width: (right-left)/frame.width, height: (bottom-top)/frame.height };
console.log('Region pixels:', { left, top, right, bottom, w: right-left, h: bottom-top });

const cropped = cropRgb24(frame, region);
console.log('Cropped dimensions:', cropped.width, cropped.height);

const headsInCrop = await localizer.run(cropped);
console.log('Heads in cropped person region:', headsInCrop);

for (const h of headsInCrop) {
  const helmetCheck = await headClassifier.run(cropped, h.boundingBox);
  console.log('Head classifier on crop:', h.label, h.confidence, 'wearingHelmet:', helmetCheck);
}

await manager.shutdown();
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
