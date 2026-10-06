import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

function expand(box, padding) {
  const x = Math.max(0, box.x - box.width * padding);
  const y = Math.max(0, box.y - box.height * padding);
  const right = Math.min(1, box.x + box.width * (1 + padding));
  const bottom = Math.min(1, box.y + box.height * (1 + padding));
  return { x, y, width: right - x, height: bottom - y };
}

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const classifier = await loadHelmetClassificationInference('helmet');

const id = '99965e01-8fb4-44e3-8b9f-615ec673274d';
const raw = await redis.get('analytics:latest-frame:' + id);
const frameData = JSON.parse(raw);
const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
const frame = {
  cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
  width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
};

const faceBox = {
  x: 0.5684945970644608,
  y: 0.38551907257273205,
  width: 0.05461929741103354,
  height: 0.06733825770945538
};

// Derive helmet head box from face
const headBox = {
  x: Math.max(0, faceBox.x - faceBox.width * 0.4),
  y: Math.max(0, faceBox.y - faceBox.height * 0.9),
  width: Math.min(1 - faceBox.x, faceBox.width * 1.8),
  height: Math.min(1 - faceBox.y, faceBox.height * 2.3)
};

console.log('Testing derived headBox:', headBox);
const resHead = await classifier.run(frame, headBox);
const resContext = await classifier.run(frame, expand(headBox, 0.15));
console.log('Classifier result:', {
  head: resHead,
  context: resContext
});

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
