import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference, loadObjectInference, yoloModelOptions } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import { YoloCocoInference } from '/app/dist/analytics-engine/src/inference/yolo-coco-inference.js';

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const model = await manager.getModel('yolov8n');
const modelConfig = manager.getModelConfig('yolov8n');
const yolo = new YoloCocoInference(model, 0.005, 0.45, yoloModelOptions(modelConfig));

const id = '26b22c59-b492-434a-aa89-163fff620af1';
const raw = await redis.get('analytics:latest-frame:' + id);
const frameData = JSON.parse(raw);
const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
const frame = {
  cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
  width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
};

const yoloObjs = await yolo.run(frame);
console.log('YOLO persons on 26b22c59:', yoloObjs.filter(o => o.label === 'person').map(o => ({
  conf: Number(o.confidence.toFixed(3)),
  box: o.boundingBox
})));

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
