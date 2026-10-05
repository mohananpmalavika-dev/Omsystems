import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { HelmetDetector } from '../analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js';
import { loadObjectInference, loadHelmetClassificationInference } from '../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '../analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js';
import { getModelManager } from '../analytics-engine/dist/analytics-engine/src/model-manager.js';

const modelsDir = path.resolve('analytics-engine/models');
process.env.MODELS_DIR = modelsDir;
process.env.MODEL_MANIFEST_PATH = path.join(modelsDir, 'manifest.json');

async function test() {
  const manager = getModelManager({
    modelsDirectory: modelsDir,
    manifestPath: path.join(modelsDir, 'manifest.json'),
  });
  await manager.initialize();

  const rawPixels = fs.readFileSync('scratch/live-ch6.jpg');
  const width = 640;
  const height = 360;
  console.log('Raw pixels length:', rawPixels.length, `(${width}x${height}x3 = ${width*height*3})`);

  const yolox = await loadObjectInference('yolov8n', 0.25);
  const frame = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId: '58b83ac6-6273-4dab-9c75-2848d7775ca2',
    timestamp: new Date(),
    width,
    height,
    imageData: rawPixels,
  };

  const detectedObjects = await yolox.run(frame);
  console.log('YOLOX Detected objects:', JSON.stringify(detectedObjects, null, 2));

  frame.metadata = {
    detections: detectedObjects,
    inferenceMode: 'local-onnx',
  };

  const classifier = await loadHelmetClassificationInference('helmet');
  const localizer = await loadObjectInference('helmet-head-localizer', 0.25);
  const verifier = new LocalizedHelmetHeadVerifier(localizer, classifier);

  // Run localizer on full frame to see what it detects
  const localizerDetections = await localizer.run(frame);
  console.log('Helmet Head Localizer raw detections:', JSON.stringify(localizerDetections, null, 2));

  // Run classifier on various crops around person if detected
  const person = detectedObjects.find(o => o.label === 'person');
  if (person) {
    console.log('--- Testing Classifier on Person Box ---', person.boundingBox);
    const box = person.boundingBox;
    // Standard head box
    const headBox = {
      x: box.x + box.width * 0.1,
      y: box.y,
      width: box.width * 0.8,
      height: box.height * 0.35,
    };
    const cHead = await classifier.run(frame, headBox);
    console.log('Classifier on standard head region:', cHead);

    const cContext = await classifier.run(frame, {
      x: Math.max(0, headBox.x - headBox.width * 0.15),
      y: Math.max(0, headBox.y - headBox.height * 0.15),
      width: Math.min(1 - headBox.x, headBox.width * 1.3),
      height: Math.min(1 - headBox.y, headBox.height * 1.3),
    });
    console.log('Classifier on head context:', cContext);

    const vResult = await verifier.verify(frame, person.boundingBox, 0.88);
    console.log('Verifier result:', vResult);
  }

  const detector = new HelmetDetector(null, 0.88, classifier, true, verifier);
  await detector.initialize();

  const results = await detector.detect(frame);
  console.log('Helmet Detector Final Results:', JSON.stringify(results, null, 2));
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
