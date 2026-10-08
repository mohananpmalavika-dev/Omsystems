import fs from 'node:fs';
import { modelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import sharp from 'sharp';

console.log('Initializing modelManager...');
process.env.MODELS_DIR = '/app/models';
process.env.HELMET_HEAD_EVIDENCE_CAMERAS = '*';
process.env.HELMET_MULTI_MODEL = 'true';
process.env.HELMET_FAST_ALERT = 'true';
process.env.PERSON_CONFIDENCE_THRESHOLD = '0.35';

await modelManager.initialize();
console.log('Model manager initialized. Ready models:', modelManager.getStats());

const detector = new HelmetDetector();
await detector.initialize();
console.log('HelmetDetector initialized successfully.');

const frames = JSON.parse(fs.readFileSync('/tmp/bettiah-frames.json', 'utf8')).filter(f => f.channel === 5);

for (const item of frames) {
  console.log('\n======================================================');
  console.log(`Diagnosing Channel 5 (${item.frameName}) ${item.width}x${item.height}`);
  const buf = Buffer.from(item.b64, 'base64');
  const rgb = await sharp(buf).removeAlpha().toColourspace('srgb').raw().toBuffer();

  const frameObj = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId: item.cameraId,
    timestamp: new Date('2026-10-08T04:37:30Z'),
    imageData: rgb,
    width: item.width,
    height: item.height,
  };

  const detResults = await detector.detect(frameObj);
  console.log('HelmetDetector.detect() result:\n', JSON.stringify(detResults, null, 2));
}
