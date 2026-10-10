import { execSync } from 'child_process';

const script = `
import sharp from 'sharp';
import { AnalyticsPipeline } from '/app/dist/analytics-engine/src/analytics-pipeline.js';

const pipeline = new AnalyticsPipeline();
await pipeline.initialize();

const blankJpeg = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 0, g: 0, b: 0 } }
}).jpeg().toBuffer();

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

// Test 1: Frame with 1 person (should trigger violation)
console.log('=== TEST 1: Frame with 1 Person ===');
const frame1Person = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: blankJpeg,
  width: 320,
  height: 240,
  metadata: {
    inferences: [
      {
        label: 'person',
        confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 }
      }
    ]
  }
};

const result1 = await pipeline.processFrame(frame1Person, rules);
console.log('Result 1 events:', JSON.stringify(result1.events.map(e => ({
  detectionType: e.detectionType,
  requiresAlert: e.requiresAlert,
  metadata: e.metadata
})), null, 2));

// Test 2: Frame with 2 persons (should NOT trigger violation)
console.log('=== TEST 2: Frame with 2 Persons ===');
const frame2Persons = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: blankJpeg,
  width: 320,
  height: 240,
  metadata: {
    inferences: [
      {
        label: 'person',
        confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 }
      },
      {
        label: 'person',
        confidence: 0.93,
        boundingBox: { x: 0.4, y: 0.1, width: 0.2, height: 0.4 }
      }
    ]
  }
};

const result2 = await pipeline.processFrame(frame2Persons, rules);
console.log('Result 2 events:', JSON.stringify(result2.events.map(e => ({
  detectionType: e.detectionType,
  requiresAlert: e.requiresAlert
})), null, 2));

// Test 3: Frame with 0 persons (idle vault, should NOT trigger violation)
console.log('=== TEST 3: Frame with 0 Persons ===');
const frame0Persons = {
  cameraId: vaultCameraId,
  tenantId: 'default',
  timestamp: new Date(),
  imageData: blankJpeg,
  width: 320,
  height: 240,
  metadata: {
    inferences: []
  }
};

const result0 = await pipeline.processFrame(frame0Persons, rules);
console.log('Result 0 events:', JSON.stringify(result0.events.map(e => ({
  detectionType: e.detectionType,
  requiresAlert: e.requiresAlert
})), null, 2));
`;

const b64 = Buffer.from(script, 'utf8').toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
