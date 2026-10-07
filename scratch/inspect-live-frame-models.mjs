import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { YoloCocoInference } from '/app/dist/analytics-engine/src/inference/yolo-coco-inference.js';
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

  const yoloConfig = manager.getModelConfig('yolov8n');
  const yoloModel = await manager.getModel('yolov8n');
  const yolo = new YoloCocoInference(yoloModel, 0.25, 0.45);

  const frame = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId,
    timestamp: new Date(),
    imageData,
    width: 640,
    height: 360,
    metadata: {}
  };

  const objects = await yolo.run(frame);
  console.log('--- YOLO DETECTIONS (threshold 0.25) ---');
  for (const obj of objects) {
    console.log(\`Label: \${obj.label}, conf: \${obj.confidence.toFixed(3)}, box: \${JSON.stringify(obj.boundingBox)}\`);
  }

  const classifier = await loadHelmetClassificationInference("helmet");
  const localizer = await loadObjectInference("helmet-head-localizer", 0.25);
  const faceDetector = await loadObjectInference("face-detector", 0.6);
  const poseEstimator = await loadPoseInference("pose-estimator", 0.4);
  const headVerifier = new LocalizedHelmetHeadVerifier(localizer, classifier, faceDetector, poseEstimator);

  const persons = objects.filter(o => o.label === 'person');
  console.log(\`--- PERSONS COUNT: \${persons.length} ---\`);
  for (const p of persons) {
    console.log('Testing person:', p.confidence, p.boundingBox);
    const vResult = await headVerifier.verify(frame, p.boundingBox, 0.50);
    console.log('Verifier (threshold 0.50):', vResult);
    const vResultStrict = await headVerifier.verify(frame, p.boundingBox, 0.80);
    console.log('Verifier (threshold 0.80):', vResultStrict);
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
