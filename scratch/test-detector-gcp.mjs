import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
  const raw = await redis.get('analytics:latest-frame:' + cameraId);
  if (!raw) {
    console.log('No frame found in redis!');
    process.exit(1);
  }
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');

  const { getModelManager } = await import('/app/dist/analytics-engine/src/model-manager.js');
  const modelManager = getModelManager({
    modelsDirectory: process.env.MODELS_DIR || '/app/models',
    enableGPU: false
  });
  if (!modelManager.isReady()) {
    await modelManager.initialize();
  }
  console.log('ModelManager ready:', modelManager.isReady(), 'models:', modelManager.getProvisioningSummary());

  const { HelmetDetector } = await import('/app/dist/analytics-engine/src/detectors/helmet-detector.js');
  const detector = new HelmetDetector(
    null,
    0.88,
    null,
    true
  );
  await detector.initialize();

  const now = Date.now();
  const testFrame = {
    cameraId,
    tenantId: '00000000-0000-4000-8000-000000000001',
    timestamp: new Date(now),
    imageData: imageBuffer,
    width: 640,
    height: 360,
    metadata: {
      inferenceMode: 'local-onnx'
    }
  };

  console.log('--- Testing detect() Frame 1 ---');
  const res1 = await detector.detect(testFrame);
  console.log('Result 1:', JSON.stringify(res1, null, 2));

  console.log('--- Testing detect() Frame 2 (+2s) ---');
  testFrame.timestamp = new Date(now + 2000);
  const res2 = await detector.detect(testFrame);
  console.log('Result 2:', JSON.stringify(res2, null, 2));

} catch (err) {
  console.error('Error in test:', err);
} finally {
  await redis.quit();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
