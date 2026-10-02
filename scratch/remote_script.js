
import { createClient } from 'redis';
import { AnalyticsPipeline } from './dist/analytics-engine/src/analytics-pipeline.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });

async function test() {
  await redis.connect();
  const data = await redis.get('analytics:latest-frame:9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc');
  if (!data) {
    console.log('No data in redis');
    process.exit(1);
  }
  const json = JSON.parse(data);
  const buf = Buffer.from(json.imageBase64, 'base64');
  console.log('Frame length:', buf.length, 'capturedAt:', json.capturedAt);

  const pipeline = new AnalyticsPipeline();
  await pipeline.initialize();

  const width = 640;
  const height = 360;
  const frame = {
    cameraId: '9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc',
    tenantId: '00000000-0000-0000-0000-000000000001',
    timestamp: new Date(json.capturedAt),
    imageData: buf,
    width,
    height,
  };

  const rules = [
    {
      id: 'rule-helmet',
      cameraId: '9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc',
      detectionType: 'helmet-worn',
      enabled: true,
      minConfidence: 0.70,
      minDurationSeconds: 1,
    }
  ];

  const events = await pipeline.processFrame(frame, rules);
  console.log('Events generated:', JSON.stringify(events, null, 2));

  // Let's also check the helmet detector directly
  const helmetDet = pipeline.helmetDetector;
  const helmetRes = await helmetDet.detect(frame);
  console.log('Direct helmet detector results:', JSON.stringify(helmetRes, null, 2));

  const faceDetector = pipeline.faceDetector;
  const faceRes = await faceDetector.detect(frame);
  console.log('Face detector results:', JSON.stringify(faceRes, null, 2));

  const objDetector = pipeline.objectDetector;
  const objRes = await objDetector.detect(frame);
  console.log('Direct object detector results:', JSON.stringify(objRes, null, 2));

  if (objDetector.inference) {
    console.log('Testing with low threshold: 0.1');
    objDetector.inference.confidenceThreshold = 0.1;
    const raw = await objDetector.inference.run(frame);
    console.log('Raw detections (threshold 0.1):', JSON.stringify(raw, null, 2));

    objDetector.inference.confidenceThreshold = 0.01;
    const rawVeryLow = await objDetector.inference.run(frame);
    console.log('Raw detections count (threshold 0.01):', rawVeryLow.length);
    if (rawVeryLow.length > 0) {
      console.log('Top 5 detections:', JSON.stringify(rawVeryLow.slice(0, 5), null, 2));
    }
  }

  for (const obj of objRes.flatMap(r => r.objects)) {
    if (obj.label === 'person' && helmetDet.classifier) {
      console.log('Testing classifier on person:', obj.boundingBox);
      const upperBox = {
        x: Math.max(0, obj.boundingBox.x - obj.boundingBox.width * 0.15),
        y: Math.max(0, obj.boundingBox.y - obj.boundingBox.height * 0.15),
        width: Math.min(1 - Math.max(0, obj.boundingBox.x - obj.boundingBox.width * 0.15), obj.boundingBox.width * 1.3),
        height: Math.min(1 - Math.max(0, obj.boundingBox.y - obj.boundingBox.height * 0.15), obj.boundingBox.height * 0.55),
      };
      const headBox = {
        x: obj.boundingBox.x + (obj.boundingBox.width * 0.1),
        y: obj.boundingBox.y,
        width: obj.boundingBox.width * 0.8,
        height: obj.boundingBox.height * 0.35,
      };
      const upper = await helmetDet.classifier.run(frame, upperBox);
      const head = await helmetDet.classifier.run(frame, headBox);
      console.log('Upper box classification:', upper);
      console.log('Head box classification:', head);
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
