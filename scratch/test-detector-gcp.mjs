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

  const { AnalyticsPipeline } = await import('/app/dist/analytics-engine/src/analytics-pipeline.js');
  const pipeline = new AnalyticsPipeline();
  await pipeline.initialize();

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

  const rules = [
    {
      id: 'debug-helmet-rule',
      cameraId,
      detectionType: 'helmet-worn',
      enabled: true,
      minConfidence: 0.5,
      minDurationSeconds: 0,
    }
  ];

  console.log('--- Direct helmetDetector.detect() ---');
  const d1 = await pipeline.helmetDetector.detect(testFrame);
  console.log('Detector 1:', JSON.stringify(d1, null, 2));

  testFrame.timestamp = new Date(now + 2000);
  const d2 = await pipeline.helmetDetector.detect(testFrame);
  console.log('Detector 2:', JSON.stringify(d2, null, 2));

  testFrame.timestamp = new Date(now + 4000);
  const d3 = await pipeline.helmetDetector.detect(testFrame);
  console.log('Detector 3:', JSON.stringify(d3, null, 2));

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
