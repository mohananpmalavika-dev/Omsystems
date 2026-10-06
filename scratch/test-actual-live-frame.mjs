import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import {
  loadObjectInference,
  loadPoseInference,
  loadHelmetClassificationInference,
} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const mm = getModelManager();
  await mm.initialize();

  const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
  const raw = await redis.get(\`analytics:latest-frame:\${cameraId}\`);
  if (!raw) {
    console.log('No frame found in redis');
    process.exit(1);
  }
  const frameData = JSON.parse(raw);
  const imageData = Buffer.from(frameData.imageBase64, 'base64');
  console.log('Image bytes:', imageData.length);

  const frame = {
    cameraId,
    timestamp: new Date(frameData.capturedAt),
    imageData,
    width: 640,
    height: 360,
    metadata: {},
  };

  console.log('--- 1. Testing Person Detector (yolov8n) ---');
  const personDetector = await loadObjectInference('yolov8n', 0.25);
  const detectedObjects = await personDetector.run(frame);
  console.log('Detected objects count:', detectedObjects.length);
  for (const obj of detectedObjects) {
    console.log(' -', obj.label, 'conf:', obj.confidence, 'box:', JSON.stringify(obj.boundingBox));
  }

  console.log('--- 2. Testing Helmet-Head Localizer ---');
  const localizer = await loadObjectInference('helmet-head-localizer', 0.15);
  const localized = await localizer.run(frame);
  console.log('Localized objects count:', localized.length);
  for (const obj of localized) {
    console.log(' -', obj.label, 'conf:', obj.confidence, 'box:', JSON.stringify(obj.boundingBox));
  }

  console.log('--- 3. Testing Face Detector (YuNet) ---');
  const faceDetector = await loadObjectInference('face-detector', 0.4);
  const faces = await faceDetector.run(frame);
  console.log('Faces detected count:', faces.length);
  for (const f of faces) {
    console.log(' - face conf:', f.confidence, 'box:', JSON.stringify(f.boundingBox));
  }

  console.log('--- 4. Testing Pose Estimator ---');
  const poseEstimator = await loadPoseInference('pose-estimator', 0.3);
  const poses = await poseEstimator.run(frame);
  console.log('Poses detected count:', poses.length);
  for (const p of poses) {
    console.log(' - pose box:', JSON.stringify(p.boundingBox), 'kp0(nose):', p.keypoints?.[0]);
  }

  console.log('--- 5. Testing EfficientNet Helmet Classifier on upper body ---');
  const classifier = await loadHelmetClassificationInference('helmet');
  const persons = detectedObjects.filter(o => o.label === 'person');
  for (const p of persons) {
    const box = p.boundingBox;
    const headBox = { x: box.x, y: box.y, width: box.width, height: box.height * 0.35 };
    const res = await classifier.run(frame, headBox);
    console.log(' - Person head crop classification:', JSON.stringify(res));
  }

} catch (err) {
  console.error('Error during test:', err);
} finally {
  await redis.quit();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
