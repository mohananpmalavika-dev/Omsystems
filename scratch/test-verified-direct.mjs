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

function expand(box, padding) {
  const x = Math.max(0, box.x - box.width * padding);
  const y = Math.max(0, box.y - box.height * padding);
  const right = Math.min(1, box.x + box.width * (1 + padding));
  const bottom = Math.min(1, box.y + box.height * (1 + padding));
  return { x, y, width: right - x, height: bottom - y };
}

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();
const classifier = await loadHelmetClassificationInference('helmet');
const headLocalizer = await loadObjectInference('helmet-head-localizer', 0.05);
const faceDetector = await loadObjectInference('face-detector', 0.10);
const model = await manager.getModel('yolov8n');
const modelConfig = manager.getModelConfig('yolov8n');
const yolo = new YoloCocoInference(model, 0.05, 0.45, yoloModelOptions(modelConfig));

for (const id of ['26b22c59-b492-434a-aa89-163fff620af1', '99965e01-8fb4-44e3-8b9f-615ec673274d']) {
  const raw = await redis.get('analytics:latest-frame:' + id);
  if (!raw) {
    console.log('No frame for', id);
    continue;
  }
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  console.log('=== Testing Candidate Generation on Camera ' + id + ' ===');

  const candidateBoxes = [];

  // Source 1: YOLO low-conf person or chair
  const yoloObjs = await yolo.run(frame);
  for (const obj of yoloObjs) {
    if (obj.label === 'person') {
      // Head is top 35% of person box
      candidateBoxes.push({
        source: 'yolo-person',
        box: {
          x: obj.boundingBox.x,
          y: Math.max(0, obj.boundingBox.y - obj.boundingBox.height * 0.1),
          width: obj.boundingBox.width,
          height: obj.boundingBox.height * 0.45
        }
      });
    }
  }

  // Source 2: Face detector (YuNet)
  if (faceDetector) {
    const faces = await faceDetector.run(frame);
    for (const f of faces) {
      // Helmet encloses the face and crown
      const headBox = {
        x: Math.max(0, f.boundingBox.x - f.boundingBox.width * 0.35),
        y: Math.max(0, f.boundingBox.y - f.boundingBox.height * 0.9),
        width: Math.min(1 - f.boundingBox.x, f.boundingBox.width * 1.7),
        height: Math.min(1 - f.boundingBox.y, f.boundingBox.height * 2.2)
      };
      candidateBoxes.push({ source: 'face-yunet', box: headBox });
    }
  }

  // Source 3: Head/helmet localizer
  if (headLocalizer) {
    const heads = await headLocalizer.run(frame);
    for (const h of heads) {
      candidateBoxes.push({ source: 'localizer-' + h.label, box: h.boundingBox });
    }
  }

  console.log('Total candidates found:', candidateBoxes.length);
  for (const { source, box } of candidateBoxes) {
    const head = await classifier.run(frame, box);
    const context = await classifier.run(frame, expand(box, 0.15));
    console.log(source, box, {
      head: head.wearingHelmetConfidence.toFixed(4),
      context: context.wearingHelmetConfidence.toFixed(4),
      wearing: head.wearingHelmet && context.wearingHelmet
    });
  }
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
