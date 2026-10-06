import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { YoloCocoInference } from '/app/dist/analytics-engine/src/inference/yolo-coco-inference.js';
import { yoloModelOptions, loadObjectInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();
const cameraId = '26b22c59-b492-434a-aa89-163fff620af1';
const raw = await redis.get('analytics:latest-frame:' + cameraId);
await redis.quit();

const frameData = JSON.parse(raw);
const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const model = await manager.getModel('yolov8n');
const modelConfig = manager.getModelConfig('yolov8n');
const yolo = new YoloCocoInference(model, 0.05, 0.45, yoloModelOptions(modelConfig));
const headLocalizer = await loadObjectInference('helmet-head-localizer', 0.05);

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
console.log('YOLO (conf>=0.05):', detections);

const heads = headLocalizer ? await headLocalizer.run(frame) : [];
console.log('Heads (conf>=0.05):', heads);

await manager.shutdown();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
