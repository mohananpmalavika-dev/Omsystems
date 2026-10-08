import { execSync } from 'child_process';

const script = `
import { createRequire } from 'node:module';
const { createClient } = createRequire('/app/package.json')('redis');
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';

const r = createClient({ url: process.env.REDIS_URL || 'redis://sentinel-gcp-redis:6379' });
await r.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false, startCleanupTimer: false });
await manager.initialize();

const objects = await loadObjectInference('yolov8n', 0.30);
const classifier = await loadHelmetClassificationInference('helmet');
const localizer = await loadObjectInference('helmet-head-localizer', 0.20);
const verifier = new LocalizedHelmetHeadVerifier(localizer, classifier, null, null, null, new Set());
const detector = new HelmetDetector(null, 0.65, classifier, true, verifier);
await detector.initialize();

const pilotCameras = [
  { name: 'Ch 1', id: 'c19f9147-bb01-4e9f-8f42-dd4b361a398e' },
  { name: 'Ch 2', id: '62245da0-302a-46b1-a068-98c8dc70892a' },
  { name: 'Ch 3', id: 'b9a60efd-cc76-4d4f-9c99-afcff5563602' },
  { name: 'Ch 4', id: '2d5563a9-2c14-4ccd-b160-8897edf2eb13' },
  { name: 'Ch 5', id: 'cf21c87a-0f42-4203-bc9c-740ef72987a1' },
  { name: 'Ch 6', id: '45a1d045-e627-4037-a239-672d3b35d87b' },
  { name: 'Ch 7', id: '8a50c8f9-b16e-4061-9665-cf6d56df3414' },
  { name: 'Ch 8', id: 'ed44346e-9473-4795-8ef3-ba4d6bfb91d9' },
  { name: 'Ch 9', id: '2d8053f1-af9f-40df-94d3-3e432e13bd85' }
];

console.log('--- Evaluating live frames for helmet / person detection ---');
for (const cam of pilotCameras) {
  const raw = await r.get('analytics:latest-frame:' + cam.id);
  if (!raw) {
    console.log(cam.name + ': No frame in Redis');
    continue;
  }
  const parsed = JSON.parse(raw);
  const data = Buffer.from(parsed.imageBase64, 'base64');
  const frame = {
    cameraId: cam.id,
    tenantId: '00000000-0000-4000-8000-000000000104',
    timestamp: new Date(parsed.capturedAt),
    imageData: data,
    width: parsed.width,
    height: parsed.height,
    metadata: { inferenceMode: 'local-onnx' }
  };
  const objResults = await objects.run(frame);
  const persons = objResults.filter(o => o.label === 'person');
  const heads = await localizer.run(frame);
  const helmetResults = await detector.detect(frame);

  console.log(cam.name + ' (' + cam.id.slice(0, 8) + '): ' +
    'persons=' + persons.length + ' ' + JSON.stringify(persons.map(p => ({ conf: p.confidence.toFixed(2), box: [Math.round(p.box.x), Math.round(p.box.y), Math.round(p.box.width), Math.round(p.box.height)] }))) +
    ', heads=' + heads.length + ' ' + JSON.stringify(heads.map(h => ({ conf: h.confidence.toFixed(2), box: [Math.round(h.box.x), Math.round(h.box.y), Math.round(h.box.width), Math.round(h.box.height)] }))) +
    ', helmetDetections=' + helmetResults.length + ' ' + JSON.stringify(helmetResults)
  );
}

await detector.cleanup();
await manager.shutdown();
await r.quit();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-analytics-engine node -"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
