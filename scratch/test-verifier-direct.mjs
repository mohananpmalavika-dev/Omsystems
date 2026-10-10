import path from 'path';
process.env.MODELS_DIR = path.resolve('analytics-engine/models');
process.env.MODEL_MANIFEST_PATH = path.resolve('analytics-engine/models/manifest.json');
process.env.USE_GPU = 'false';

import sharp from 'sharp';
import { getModelManager } from '../analytics-engine/dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference, loadPoseInference } from '../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js';
import { LocalizedHelmetHeadVerifier } from '../analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js';

async function main() {
  await getModelManager({ enableGPU: false }).initialize();

  const img = sharp('scratch/event-b335-snapshot.jpg');
  const meta = await img.metadata();
  const rawRgb = await img.removeAlpha().raw().toBuffer();

  const frame = {
    cameraId: '9cf710ef-1a0b-444b-9c30-abbac95948fe',
    timestamp: new Date(),
    width: meta.width,
    height: meta.height,
    imageData: rawRgb,
  };

  const yolo = await loadObjectInference('yolov8n', 0.25);
  const persons = await yolo.run(frame);
  console.log('Persons:', persons);

  const localizer = await loadObjectInference('helmet-head-localizer', 0.25);
  const classifier = await loadHelmetClassificationInference('helmet');
  const headClassifier = await loadHelmetClassificationInference('helmet-head-evidence');
  const faceDetector = await loadObjectInference('face-detector', 0.6);
  const poseEstimator = await loadPoseInference('pose-estimator', 0.4);

  // Case 1: with evidenceCameras = new Set(['*'])
  const verifierWithEvidence = new LocalizedHelmetHeadVerifier(
    localizer, classifier, faceDetector, poseEstimator, headClassifier, new Set(['*'])
  );

  // Case 2: without evidenceCameras (or not matching this camera)
  const verifierStandard = new LocalizedHelmetHeadVerifier(
    localizer, classifier, faceDetector, poseEstimator, headClassifier, new Set(['other-cam'])
  );

  for (const p of persons.filter(p => p.label === 'person')) {
    console.log('\n--- Testing Person ---', p.boundingBox);
    const resWithEvidence = await verifierWithEvidence.verify(frame, p.boundingBox, 0.75);
    console.log('Result WITH HELMET_HEAD_EVIDENCE (*):', resWithEvidence);

    const resStandard = await verifierStandard.verify(frame, p.boundingBox, 0.75);
    console.log('Result STANDARD (without head evidence on this cam):', resStandard);
  }
}

main().catch(console.error);
