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
const headLocalizer = await loadObjectInference('helmet-head-localizer', 0.10);
const faceDetector = await loadObjectInference('face-detector', 0.08);
const model = await manager.getModel('yolov8n');
const modelConfig = manager.getModelConfig('yolov8n');
const yolo = new YoloCocoInference(model, 0.04, 0.45, yoloModelOptions(modelConfig));

async function verifyDirectCandidates(frame, threshold = 0.88) {
  const candidates = [];

  // 1. From head localizer (head / helmet >= 0.10)
  if (headLocalizer) {
    const heads = await headLocalizer.run(frame);
    for (const h of heads) {
      if ((h.label === 'head' || h.label === 'helmet') && (h.confidence ?? 0) >= 0.10) {
        candidates.push({ source: 'localizer', box: h.boundingBox, conf: h.confidence });
      }
    }
  }

  // 2. From YOLO person (even low-confidence seated/low-light person >= 0.04)
  const yoloObjects = await yolo.run(frame);
  for (const obj of yoloObjects) {
    if (obj.label === 'person' && (obj.confidence ?? 0) >= 0.04) {
      const b = obj.boundingBox;
      const headBox = {
        x: Math.max(0, b.x + b.width * 0.1),
        y: Math.max(0, b.y - b.height * 0.1),
        width: Math.min(1 - b.x, b.width * 0.8),
        height: Math.min(1 - b.y, b.height * 0.45),
      };
      candidates.push({ source: 'yolo-person', box: headBox, conf: obj.confidence });
    }
  }

  // 3. From YuNet face detector
  if (faceDetector) {
    const faces = await faceDetector.run(frame);
    for (const f of faces) {
      if ((f.confidence ?? 0) >= 0.08) {
        const fb = f.boundingBox;
        const headBox = {
          x: Math.max(0, fb.x - fb.width * 0.35),
          y: Math.max(0, fb.y - fb.height * 0.9),
          width: Math.min(1 - fb.x, fb.width * 1.7),
          height: Math.min(1 - fb.y, fb.height * 2.2),
        };
        candidates.push({ source: 'face', box: headBox, conf: f.confidence });
      }
    }
  }

  const verified = [];
  for (const c of candidates) {
    const box = c.box;
    if (box.width * frame.width < 15 || box.height * frame.height < 15) continue;
    const head = await classifier.run(frame, box);
    const context = await classifier.run(frame, expand(box, 0.15));
    if (head.wearingHelmet && context.wearingHelmet &&
        Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence) >= threshold) {
      verified.push({
        source: c.source,
        box,
        classificationConfidence: Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence),
        proposalConfidence: c.conf
      });
    }
  }
  return verified;
}

const keys = await redis.keys('analytics:latest-frame:*');
for (const key of keys) {
  const cameraId = key.replace('analytics:latest-frame:', '');
  const raw = await redis.get(key);
  if (!raw) continue;
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  const verified = await verifyDirectCandidates(frame, 0.88);
  console.log('Camera ' + cameraId + ': ' + (verified.length > 0 ? 'ALERT! ' + JSON.stringify(verified) : 'Clean (no helmet)'));
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
