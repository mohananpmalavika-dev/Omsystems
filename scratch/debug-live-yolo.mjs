import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { YoloCocoInference } from '/app/dist/analytics-engine/src/inference/yolo-coco-inference.js';
import { yoloModelOptions, loadObjectInference, loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();
const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
const raw = await redis.get('analytics:latest-frame:' + cameraId);
await redis.quit();

if (!raw) {
  console.log('No frame found in redis for camera:', cameraId);
  process.exit(1);
}

const frameData = JSON.parse(raw);
const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
console.log('Frame capturedAt:', frameData.capturedAt, 'Buffer length:', imageBuffer.length);

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();

const model = await manager.getModel('yolov8n');
const modelConfig = manager.getModelConfig('yolov8n');
const yolo = new YoloCocoInference(model, 0.15, 0.45, yoloModelOptions(modelConfig));

const frame = {
  cameraId,
  tenantId: 'test',
  timestamp: new Date(),
  imageData: imageBuffer,
  width: 640,
  height: 360,
  metadata: { inferenceMode: 'local-onnx' }
};

const detections = await yolo.run(frame);
console.log('YOLO Detections count (conf>=0.15):', detections.length);
console.log('YOLO Detections:', JSON.stringify(detections, null, 2));

const headLocalizer = await loadObjectInference('helmet-head-localizer', 0.15);
if (headLocalizer) {
  const heads = await headLocalizer.run(frame);
  console.log('Head Localizer Detections:', JSON.stringify(heads, null, 2));
}

const classifier = await loadHelmetClassificationInference('helmet');
if (classifier && detections.length > 0) {
  for (const d of detections) {
    if (d.label === 'person') {
      const res = await classifier.run(frame, d.boundingBox);
      console.log('Classifier on person', d.boundingBox, res);
    }
  }
}

await manager.shutdown();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
