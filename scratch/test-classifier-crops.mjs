import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const classifier = await loadHelmetClassificationInference('helmet');

for (const id of ['26b22c59-b492-434a-aa89-163fff620af1', '99965e01-8fb4-44e3-8b9f-615ec673274d']) {
  const raw = await redis.get('analytics:latest-frame:' + id);
  if (!raw) {
    console.log('No frame for', id);
    continue;
  }
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  console.log('=== Camera ' + id + ' Scanning upper body crops ===');
  // Scan reasonable head/torso crop boxes
  const boxes = [
    { x: 0.5, y: 0.1, width: 0.25, height: 0.4 },
    { x: 0.6, y: 0.1, width: 0.25, height: 0.4 },
    { x: 0.65, y: 0.05, width: 0.2, height: 0.3 },
    { x: 0.7, y: 0.1, width: 0.25, height: 0.4 },
    { x: 0.55, y: 0.15, width: 0.2, height: 0.3 },
    { x: 0.6, y: 0.2, width: 0.2, height: 0.3 },
    { x: 0.65, y: 0.15, width: 0.25, height: 0.35 }
  ];
  for (const b of boxes) {
    const res = await classifier.run(frame, b);
    if (res.wearingHelmet) {
      console.log('POSITIVE at', b, 'conf:', res.wearingHelmetConfidence.toFixed(4));
    }
  }
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
