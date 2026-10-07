import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import { createClient } from 'redis';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference, loadObjectInference, loadPoseInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const cameraId = 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d';
  const raw = await redis.get(\`analytics:latest-frame:\${cameraId}\`);
  const frameData = JSON.parse(raw);
  const imageData = Buffer.from(frameData.imageBase64, 'base64');

  const manager = getModelManager();
  await manager.initialize();
  
  const classifier = await loadHelmetClassificationInference("helmet");
  const localizer = await loadObjectInference("helmet-head-localizer", 0.25);
  const faceDetector = await loadObjectInference("face-detector", 0.6);
  const poseEstimator = await loadPoseInference("pose-estimator", 0.4);
  const headVerifier = new LocalizedHelmetHeadVerifier(localizer, classifier, faceDetector, poseEstimator);

  const detector = new HelmetDetector(null, 0.70, classifier, true, headVerifier);
  await detector.initialize();

  const frame = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId,
    timestamp: new Date(),
    imageData,
    width: 640,
    height: 360,
    metadata: {}
  };

  console.log('Running detector on live frame 1:');
  const res1 = await detector.detect(frame);
  console.log('Res 1:', JSON.stringify(res1));

  console.log('Running detector on live frame 2 (1s later):');
  frame.timestamp = new Date(Date.now() + 1000);
  const res2 = await detector.detect(frame);
  console.log('Res 2:', JSON.stringify(res2));

} catch (err) {
  console.error('Debug error:', err);
} finally {
  await redis.quit();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
