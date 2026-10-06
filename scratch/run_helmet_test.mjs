import fs from 'fs';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import { ObjectDetector } from '/app/dist/analytics-engine/src/detectors/object-detector.js';

// Read frame from redis dump
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

// Initialize object detector
console.log('--- Initializing Object Detector ---');
const objDetector = new ObjectDetector();
await objDetector.initialize();

const objResults = await objDetector.detect(frame);
console.log('Object Detector Results:', JSON.stringify(objResults, null, 2));

const detectedObjects = objResults.flatMap((r) => r.objects || []);
console.log('Detected objects count:', detectedObjects.length);
for (const obj of detectedObjects) {
  console.log(`- ${obj.label}: conf=${obj.confidence}, bbox=${JSON.stringify(obj.boundingBox)}`);
}

// Add detections to frame
frame.metadata.detections = detectedObjects;

// Initialize helmet detector
console.log('--- Initializing Helmet Detector ---');
const helmetDetector = new HelmetDetector();
await helmetDetector.initialize();

const helmetResults = await helmetDetector.detect(frame);
console.log('Helmet Detector Results:', JSON.stringify(helmetResults, null, 2));
