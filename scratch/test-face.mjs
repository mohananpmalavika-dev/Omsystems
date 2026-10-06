import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadObjectInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const faceDetector = await loadObjectInference('face-detector', 0.1);

for (const id of ['26b22c59-b492-434a-aa89-163fff620af1', '99965e01-8fb4-44e3-8b9f-615ec673274d']) {
  const raw = await redis.get('analytics:latest-frame:' + id);
  if (!raw) continue;
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  console.log('=== Camera ' + id + ' Face Detector ===');
  if (faceDetector) {
    const faces = await faceDetector.run(frame);
    console.log('Faces detected:', JSON.stringify(faces));
  }
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
