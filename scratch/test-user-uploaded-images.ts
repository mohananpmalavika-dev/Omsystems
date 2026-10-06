import sharp from 'sharp';
import { getModelManager } from '../analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '../analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '../analytics-engine/src/inference/helmet-head-verification.js';
import { HelmetDetector } from '../analytics-engine/src/detectors/helmet-detector.js';
import fs from 'node:fs';
import path from 'node:path';

const uploadDir = 'C:/Users/Dhanya/.gemini/antigravity-ide/brain/f1209b1f-846c-4f2e-ad62-1b187b4eccbf/.user_uploaded';
const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.jpg')).map(f => path.join(uploadDir, f));

const manager = getModelManager({ modelsDirectory: 'analytics-engine/models', enableGPU: false, startCleanupTimer: false });
await manager.initialize();

const yolo = await loadObjectInference('yolov8n', 0.35);
const localizer = await loadObjectInference('helmet-head-localizer', 0.25);
const classifier = await loadHelmetClassificationInference('helmet');

console.log(`Testing ${files.length} user uploaded images...`);

for (const file of files) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = { cameraId: path.basename(file), tenantId: 'test', timestamp: new Date(), imageData: data, width: info.width, height: info.height };
  
  const persons = (await yolo.run(frame)).filter(o => o.label === 'person');
  const heads = await localizer.run(frame);
  
  console.log(`\n--- Image: ${path.basename(file)} ---`);
  console.log(`Persons: ${persons.length}, Heads/Helmets detected by localizer: ${heads.length}`);
  for (const h of heads) {
    const full = await classifier.run(frame, h.boundingBox);
    const crown = await classifier.run(frame, { ...h.boundingBox, height: h.boundingBox.height * 0.65 });
    console.log(`  Localizer: label=${h.label}, conf=${h.confidence?.toFixed(3)}, box=${JSON.stringify(h.boundingBox)}`);
    console.log(`    Classifier full: wearing=${full.wearingHelmet}, conf=${full.wearingHelmetConfidence.toFixed(3)}`);
    console.log(`    Classifier crown: wearing=${crown.wearingHelmet}, conf=${crown.wearingHelmetConfidence.toFixed(3)}`);
  }
  
  // Current detector
  const verifier = new LocalizedHelmetHeadVerifier(localizer, classifier);
  const currentDetector = new HelmetDetector(null, 0.88, classifier, true, verifier);
  await currentDetector.initialize();
  const res = await currentDetector.detect({ ...frame, metadata: { inferenceMode: 'local-onnx', detections: persons } });
  console.log(`  Current detector results count: ${res.length}`);
  if (res.length > 0) {
    console.log(`    ALARM TRIGGERED! Evidence: ${res[0].metadata?.evidenceSource}, conf: ${res[0].confidence}`);
  }
}

await manager.shutdown();
