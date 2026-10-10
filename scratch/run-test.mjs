import { execSync } from 'child_process';

const testScript = `
import sharp from 'sharp';
import { AnalyticsPipeline } from '/app/dist/analytics-engine/src/analytics-pipeline.js';

const pipeline = new AnalyticsPipeline();
await pipeline.initialize();

const rawRgb = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 0, g: 0, b: 0 } }
}).raw().toBuffer();

const vaultCameraId = '699e8b00-cfac-4a22-b0f5-802c95f68431'; // Bettaih Ch 1
const rules = [
  {
    id: '485522ba-846e-4bbc-9ef0-4958dbafb396',
    name: 'Banking AI - Dual control verification',
    cameraId: vaultCameraId,
    detectionType: 'dual-control-verification',
    enabled: true,
    minConfidence: 0.5,
    minDurationSeconds: 0
  }
];

// Test 1: 1 person in vault (single person exception should trigger!)
const frame1Person = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: rawRgb,
  width: 320,
  height: 240,
  metadata: {
    detections: [
      {
        label: 'person',
        confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 }
      }
    ]
  }
};

// Test 2: 2 persons in vault (dual custody satisfied - NO exception!)
const frame2Persons = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: rawRgb,
  width: 320,
  height: 240,
  metadata: {
    detections: [
      {
        label: 'person',
        confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 }
      },
      {
        label: 'person',
        confidence: 0.92,
        boundingBox: { x: 0.4, y: 0.1, width: 0.2, height: 0.4 }
      }
    ]
  }
};

// Test 3: 0 persons (idle vault - NO exception!)
const frame0Persons = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: rawRgb,
  width: 320,
  height: 240,
  metadata: {
    detections: []
  }
};

try {
  const events1 = await pipeline.processFrame(frame1Person, rules);
  console.log('SUCCESS_TEST1:' + JSON.stringify(events1.map(e => ({
    type: e.detectionType,
    alert: e.requiresAlert,
    meta: e.metadata
  }))));

  const events2 = await pipeline.processFrame(frame2Persons, rules);
  console.log('SUCCESS_TEST2:' + JSON.stringify(events2.map(e => ({
    type: e.detectionType,
    alert: e.requiresAlert
  }))));

  const events0 = await pipeline.processFrame(frame0Persons, rules);
  console.log('SUCCESS_TEST0:' + JSON.stringify(events0.map(e => ({
    type: e.detectionType,
    alert: e.requiresAlert
  }))));
} catch (err) {
  console.log('FAIL_TEST:' + err.stack);
}
process.exit(0);
`;

const b64 = Buffer.from(testScript, 'utf8').toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module 2>/dev/null"`;

try {
  const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
  console.log('OUTPUT:', out);
} catch (e) {
  console.log('ERROR stdout:', e.stdout);
  console.log('ERROR stderr:', e.stderr);
}
