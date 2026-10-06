import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import { createClient } from 'redis';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import { ObjectDetector } from '/app/dist/analytics-engine/src/detectors/object-detector.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

try {
  const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
  const raw = await redis.get(\`analytics:latest-frame:\${cameraId}\`);
  if (!raw) {
    console.log('No frame found in redis for', cameraId);
    process.exit(1);
  }
  const frameData = JSON.parse(raw);
  console.log('Frame loaded. CapturedAt:', frameData.capturedAt, 'ImageBase64 length:', frameData.imageBase64?.length);

  const objectDetector = new ObjectDetector();
  await objectDetector.initialize();

  const helmetDetector = new HelmetDetector();
  await helmetDetector.initialize();

  const frame = {
    cameraId,
    timestamp: new Date(frameData.capturedAt || Date.now()),
    imageData: Buffer.from(frameData.imageBase64, 'base64'),
    metadata: {
      source: 'redis-debug',
      detections: frameData.detections || [],
      ...frameData.metadata,
    }
  };

  console.log('Running object detector...');
  const objectResults = await objectDetector.detect(frame);
  const detectedObjects = objectResults.flatMap(r => r.objects || []);
  console.log('Detected objects:', JSON.stringify(detectedObjects.map(o => ({ label: o.label, conf: o.confidence, box: o.boundingBox })), null, 2));

  const frameWithDetections = {
    ...frame,
    metadata: {
      ...frame.metadata,
      detections: detectedObjects,
    }
  };

  console.log('Running helmet detector (Frame 1)...');
  const helmetResults1 = await helmetDetector.detect(frameWithDetections);
  console.log('Helmet detector results (Frame 1):', JSON.stringify(helmetResults1, null, 2));

  console.log('Running helmet detector (Frame 2 - for confirmation)...');
  const helmetResults2 = await helmetDetector.detect(frameWithDetections);
  console.log('Helmet detector results (Frame 2):', JSON.stringify(helmetResults2, null, 2));

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
