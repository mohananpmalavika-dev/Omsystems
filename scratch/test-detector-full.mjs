import path from 'path';
process.env.MODELS_DIR = path.resolve('analytics-engine/models');
process.env.MODEL_MANIFEST_PATH = path.resolve('analytics-engine/models/manifest.json');
process.env.HELMET_MULTI_MODEL = 'true';
process.env.USE_GPU = 'false';

import sharp from 'sharp';
import { getModelManager } from '../analytics-engine/dist/analytics-engine/src/model-manager.js';
import { HelmetDetector } from '../analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js';

async function testImage(imagePath, evidenceCameras) {
  process.env.HELMET_HEAD_EVIDENCE_CAMERAS = evidenceCameras;
  const img = sharp(imagePath);
  const meta = await img.metadata();
  const rawRgb = await img.removeAlpha().raw().toBuffer();

  const frame = {
    cameraId: '9cf710ef-1a0b-444b-9c30-abbac95948fe', // PERAVURANI CASH
    timestamp: new Date(),
    width: meta.width,
    height: meta.height,
    imageData: rawRgb,
  };

  const { loadObjectInference } = await import('../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js');
  const yolo = await loadObjectInference('yolov8n', 0.25);
  const detector = new HelmetDetector(yolo, 0.75, null, true);
  await detector.initialize();

  const results = await detector.detect(frame);
  console.log(`\n=== HelmetDetector results for ${imagePath} with HELMET_HEAD_EVIDENCE_CAMERAS="${evidenceCameras}" ===`);
  console.log('Results count:', results.length);
  for (const r of results) {
    console.log('Type:', r.detectionType, 'requiresAlert:', r.requiresAlert, 'confidence:', r.confidence);
    console.log('Metadata:', JSON.stringify(r.metadata, null, 2));
  }
}

async function main() {
  await getModelManager({ enableGPU: false }).initialize();
  await testImage('scratch/event-b335-snapshot.jpg', '*');
  await testImage('scratch/event-b335-snapshot.jpg', '3da93c6e-6824-43dc-9bba-7332707d5856,fb465a8f-5d79-4a3f-9cb8-b8cec471708d');
}

main().catch(console.error);
