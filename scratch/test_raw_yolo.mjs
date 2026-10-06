import fs from 'fs';
import { loadObjectInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';

const raw = fs.readFileSync('/tmp/frame.json', 'utf8');
const data = JSON.parse(raw);
const imageData = Buffer.from(data.imageBase64, 'base64');

console.log('Frame byte length:', imageData.length);

const frame = {
  cameraId: '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
  tenantId: '00000000-0000-4000-8000-000000000001',
  timestamp: new Date(data.capturedAt),
  imageData,
  width: 640,
  height: 360,
  metadata: { inferenceMode: 'local-onnx' }
};

const mgr = getModelManager();
await mgr.initialize();

const yolo = await loadObjectInference('yolov8n', 0.1);
const detections = await yolo.run(frame);
console.log('Raw detections (threshold 0.1):', detections.length);
for (const d of detections) {
  console.log(`Label: ${d.label}, Conf: ${d.confidence.toFixed(3)}, Box: x=${d.boundingBox.x.toFixed(2)}, y=${d.boundingBox.y.toFixed(2)}, w=${d.boundingBox.width.toFixed(2)}, h=${d.boundingBox.height.toFixed(2)}`);
}

// Also test helmet-head-localizer!
try {
  const localizer = await loadObjectInference('helmet-head-localizer', 0.1);
  const headDetections = await localizer.run(frame);
  console.log('Head localizer detections (threshold 0.1):', headDetections.length);
  for (const d of headDetections) {
    console.log(`Head/Helmet: ${d.label}, Conf: ${d.confidence.toFixed(3)}, Box: x=${d.boundingBox.x.toFixed(2)}, y=${d.boundingBox.y.toFixed(2)}, w=${d.boundingBox.width.toFixed(2)}, h=${d.boundingBox.height.toFixed(2)}`);
  }
} catch (e) {
  console.error('Localizer error:', e.message);
}
