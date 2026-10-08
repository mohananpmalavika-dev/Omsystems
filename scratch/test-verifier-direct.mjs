import { execSync } from 'child_process';

const testScript = `
import path from 'node:path';
import { loadRgbFrame } from './scripts/helmet-replay.mjs';
import { getModelManager } from './dist/analytics-engine/src/model-manager.js';
import { loadObjectInference } from './dist/analytics-engine/src/inference/configured-model-inference.js';
import { HelmetDetector } from './dist/analytics-engine/src/detectors/helmet-detector.js';

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false, startCleanupTimer: false });
await manager.initialize();

const objects = await loadObjectInference('yolov8n', 0.35);
const detector = new HelmetDetector(null, 0.75, null, true);
await detector.initialize();

const frame = await loadRgbFrame({
  file: '/tmp/pilot_test_ch8.rgb',
  width: 640,
  height: 360,
  capturedAt: '2026-10-08T04:56:28.652Z'
}, 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda');

frame.metadata = { ...frame.metadata, detections: await objects.run(frame) };
console.log('Detected persons:', frame.metadata.detections.filter(d => d.label === 'person'));

// Let's directly call headVerifier on the person bounding box!
const verifier = detector.headVerifier;
for (const p of frame.metadata.detections.filter(d => d.label === 'person')) {
  console.log('Testing person bbox:', p.boundingBox, 'conf:', p.confidence);
  const result = await verifier.verify(frame, p.boundingBox, 0.75);
  console.log('Verifier result:', result);
}

await detector.cleanup();
await manager.shutdown();
`;

const b64 = Buffer.from(testScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));

