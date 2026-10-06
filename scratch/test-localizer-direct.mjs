import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
process.env.MODELS_DIR = '/app/models';
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const mm = getModelManager({ modelsDirectory: '/app/models' });
  await mm.initialize();

  const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
  const raw = await redis.get(\`analytics:latest-frame:\${cameraId}\`);
  const frameData = JSON.parse(raw);
  const imageData = Buffer.from(frameData.imageBase64, 'base64');

  const frame = {
    cameraId,
    timestamp: new Date(frameData.capturedAt),
    imageData,
    width: 640,
    height: 360,
    metadata: {},
  };

  console.log('--- 1. Testing helmet-head-localizer (threshold 0.15) ---');
  const localizer = await loadObjectInference('helmet-head-localizer', 0.15);
  const localDetections = await localizer.run(frame);
  console.log('Localizer detections:', JSON.stringify(localDetections, null, 2));

  console.log('--- 2. Testing yolov8n person detector (threshold 0.15) ---');
  const personDetector = await loadObjectInference('yolov8n', 0.15);
  const personDetections = await personDetector.run(frame);
  console.log('Person detections (threshold 0.15):', JSON.stringify(personDetections, null, 2));

  console.log('--- 3. Testing helmet classifier on center/head crops ---');
  const classifier = await loadHelmetClassificationInference('helmet');
  // Try several crops where the person with helmet is sitting
  // In the screenshot: person is in the center, from x ~ 0.35 to 0.65, y ~ 0.05 to 0.70
  const candidateCrops = [
    { label: 'center_head_tight', box: { x: 0.40, y: 0.05, width: 0.20, height: 0.35 } },
    { label: 'center_head_wide', box: { x: 0.35, y: 0.05, width: 0.30, height: 0.40 } },
    { label: 'center_helmet_crown', box: { x: 0.40, y: 0.05, width: 0.20, height: 0.25 } },
  ];
  for (const c of candidateCrops) {
    const res = await classifier.run(frame, c.box);
    console.log(c.label, ':', JSON.stringify(res));
  }

} catch (err) {
  console.error('Error:', err);
} finally {
  await redis.quit();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
