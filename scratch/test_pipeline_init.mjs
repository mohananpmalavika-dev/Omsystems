import fs from 'fs';
import { AnalyticsPipeline } from '/app/dist/analytics-engine/src/analytics-pipeline.js';

const raw = fs.readFileSync('/tmp/frame.json', 'utf8');
const data = JSON.parse(raw);
const imageData = Buffer.from(data.imageBase64, 'base64');

console.log('Frame loaded. Byte length:', imageData.length);

const frame = {
  cameraId: '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
  tenantId: '00000000-0000-4000-8000-000000000001',
  timestamp: new Date(data.capturedAt),
  imageData,
  width: 640,
  height: 360,
  metadata: { inferenceMode: 'local-onnx' }
};

const rules = [{
  id: '5b3b397a-0f2a-4754-a54d-7cb4d9e027e9',
  cameraId: '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
  name: 'AI - Helmet worn inside bank',
  detectionType: 'helmet-worn',
  enabled: true,
  minConfidence: 0.70,
  minDurationSeconds: 1,
  cooldownSeconds: 60,
  severity: 'P2',
  objectClasses: ['helmet', 'person']
}];

console.log('Initializing AnalyticsPipeline...');
const pipeline = new AnalyticsPipeline();
await pipeline.initialize();

console.log('Processing frame...');
let personCount = null;
const events = await pipeline.processFrame(frame, rules, (obs) => { personCount = obs; });

console.log('Person count:', personCount);
console.log('Events generated count:', events.length);
console.log('Events:', JSON.stringify(events, null, 2));
