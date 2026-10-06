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

const id = '26b22c59-b492-434a-aa89-163fff620af1';
const raw = await redis.get('analytics:latest-frame:' + id);
const frameData = JSON.parse(raw);
const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
const frame = {
  cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
  width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
};

const testBoxes = [
  { name: 'real-helmet-head', box: { x: 0.60, y: 0.08, width: 0.18, height: 0.22 } },
  { name: 'door-left', box: { x: 0.1, y: 0.1, width: 0.25, height: 0.4 } },
  { name: 'floor-bottom-left', box: { x: 0.1, y: 0.6, width: 0.25, height: 0.3 } },
];

for (const { name, box } of testBoxes) {
  const head = await classifier.run(frame, box);
  const context = await classifier.run(frame, expand(box, 0.15));
  const surrounding = await classifier.run(frame, expand(box, 0.75));
  console.log(name, {
    head: head.wearingHelmetConfidence.toFixed(4),
    context: context.wearingHelmetConfidence.toFixed(4),
    surrounding: surrounding.wearingHelmetConfidence.toFixed(4)
  });
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
