import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadPoseInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const pose = await loadPoseInference('pose-estimator', 0.1);

for (const id of ['26b22c59-b492-434a-aa89-163fff620af1', '99965e01-8fb4-44e3-8b9f-615ec673274d']) {
  const raw = await redis.get('analytics:latest-frame:' + id);
  if (!raw) continue;
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  console.log('=== Camera ' + id + ' Pose Estimator ===');
  if (pose) {
    const results = await pose.run(frame);
    console.log('Pose detections count:', results.length);
    for (const r of results) {
      console.log('Box:', r.boundingBox, 'Confidence:', r.confidence);
      const kp = r.keypoints.filter(k => k.confidence > 0.2);
      console.log('Valid keypoints count:', kp.length);
    }
  } else {
    console.log('No pose estimator loaded');
  }
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
