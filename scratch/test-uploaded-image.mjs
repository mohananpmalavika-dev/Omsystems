import path from 'path';
process.env.MODELS_DIR = path.resolve('analytics-engine/models');
process.env.MODEL_MANIFEST_PATH = path.resolve('analytics-engine/models/manifest.json');
process.env.USE_GPU = 'false';

import sharp from 'sharp';
import fs from 'fs';

async function main() {
  const imagePath = 'scratch/event-b335-snapshot.jpg';
  const img = sharp(imagePath);
  const meta = await img.metadata();
  const rawRgb = await img.removeAlpha().raw().toBuffer();

  const frame = {
    cameraId: '9cf710ef-1a0b-444b-9c30-abbac95948fe',
    timestamp: new Date(),
    width: meta.width,
    height: meta.height,
    imageData: rawRgb,
  };

  console.log('Image dimensions:', meta.width, 'x', meta.height);

  const { getModelManager } = await import('../analytics-engine/dist/analytics-engine/src/model-manager.js');
  await getModelManager({ enableGPU: false }).initialize();
  console.log('ModelManager inventory count:', getModelManager().getModelInventory().length);
  console.log('Models:', getModelManager().getModelInventory().map(m => m.id));

  const { loadObjectInference, loadHelmetClassificationInference, loadPoseInference } =
    await import('../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js');

  const localizer = await loadObjectInference('helmet-head-localizer', 0.2);
  const headObjects = await localizer.run(frame);
  console.log('\n--- helmet-head-localizer detections ---');
  console.log(JSON.stringify(headObjects, null, 2));

  const yolo = await loadObjectInference('yolov8n', 0.25);
  const personObjects = await yolo.run(frame);
  console.log('\n--- yolov8n detections ---');
  console.log(JSON.stringify(personObjects, null, 2));

  function expand(box, margin) {
    const dx = box.width * margin;
    const dy = box.height * margin;
    const x = Math.max(0, box.x - dx);
    const y = Math.max(0, box.y - dy);
    return {
      x,
      y,
      width: Math.min(1 - x, box.width + dx * 2),
      height: Math.min(1 - y, box.height + dy * 2),
    };
  }

  const serverBox = {
    x: 0.501286123096943,
    y: 0.4713785576820373,
    width: 0.15527094349265094,
    height: 0.23622575256559578
  };

  try {
    const headClassifier = await loadHelmetClassificationInference('helmet-head-evidence');
    for (const [name, b] of [
      ['head box unexpanded', headObjects[0].boundingBox],
      ['head box expand 0.15', expand(headObjects[0].boundingBox, 0.15)],
      ['head box expand 0.25', expand(headObjects[0].boundingBox, 0.25)],
      ['server box unexpanded', serverBox],
      ['server box expand 0.15', expand(serverBox, 0.15)],
      ['server box expand 0.25', expand(serverBox, 0.25)],
    ]) {
      const res = await headClassifier.run(frame, b);
      console.log(`--- helmet-head-evidence on ${name} ---`);
      console.log('wearingHelmet:', res.wearingHelmet, 'wearingHelmetConfidence:', res.wearingHelmetConfidence);
    }
  } catch (err) {
    console.error('Error running headClassifier:', err);
  }

  try {
    const poseEstimator = await loadPoseInference('pose-estimator', 0.3);
    const poses = await poseEstimator.run(frame);
    console.log('\n--- pose-estimator detections ---');
    console.log(JSON.stringify(poses, null, 2));
  } catch (err) {
    console.error('Error running poseEstimator:', err);
  }


  try {
    const motorcycleClassifier = await loadHelmetClassificationInference('helmet');
    for (const h of headObjects) {
      const res = await motorcycleClassifier.run(frame, h.boundingBox);
      console.log('\n--- helmet (motorcycle classifier) score on', h.label, '---');
      console.log('wearingHelmet:', res.wearingHelmet, 'confidence:', res.wearingHelmetConfidence);
    }
  } catch (err) {
    console.error('Error running motorcycleClassifier:', err.message);
  }
}

main().catch(console.error);
