import path from 'node:path';
import { loadRgbFrame, openHelmetReplay } from '../analytics-engine/scripts/helmet-replay.mjs';

async function main() {
  process.env.HELMET_HEAD_EVIDENCE_CAMERAS = '*';
  process.env.HELMET_FAST_ALERT = 'true';
  process.env.HELMET_MULTI_MODEL = 'true';

  const file = path.resolve('scratch/bettiah-entry-20261008/ch5/frame-005.jpg');
  const frame = await loadRgbFrame({
    file,
    capturedAt: '2026-10-08T04:37:30Z'
  }, 'd02f79e9-0615-4df6-a604-d3e4b8bde9b2');

  const { getModelManager } = await import('../analytics-engine/dist/analytics-engine/src/model-manager.js');
  const { loadObjectInference, loadHelmetClassificationInference, loadPoseInference } =
    await import('../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js');
  const { LocalizedHelmetHeadVerifier } =
    await import('../analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js');

  const manager = getModelManager({
    modelsDirectory: path.resolve('analytics-engine/models'),
    enableGPU: false
  });
  await manager.initialize();

  const yolo = await loadObjectInference('yolov8n', 0.25);
  const localizer = await loadObjectInference('helmet-head-localizer', 0.20);
  const classifier = await loadHelmetClassificationInference('helmet');
  const headEvidence = await loadHelmetClassificationInference('helmet-head-evidence');
  const face = await loadObjectInference('face-detector', 0.5);
  const pose = await loadPoseInference('pose-estimator', 0.4);

  const verifier = new LocalizedHelmetHeadVerifier(
    localizer,
    classifier,
    face,
    pose,
    headEvidence,
    new Set(['*'])
  );

  const objects = await yolo.run(frame);
  console.log('YOLO objects:', objects);

  const localHeads = await localizer.run(frame);
  console.log('Localizer all objects on frame:', localHeads);

  const person = objects.find(o => o.label === 'person');
  if (person) {
    console.log('\n--- Person Found ---');
    console.log('Person boundingBox:', person.boundingBox);
    console.log('Person height in px:', person.boundingBox.height * frame.height);
    console.log('Person width in px:', person.boundingBox.width * frame.width);

    // Test verifier.verify
    const vResult = await verifier.verify(frame, person.boundingBox, 0.70);
    console.log('\nverifier.verify(threshold=0.70):', vResult);

    const vResultLower = await verifier.verify(frame, person.boundingBox, 0.50);
    console.log('verifier.verify(threshold=0.50):', vResultLower);

    // Direct classification on head crop
    const headBox = {
      x: Math.max(0, person.boundingBox.x),
      y: Math.max(0, person.boundingBox.y),
      width: person.boundingBox.width,
      height: person.boundingBox.height * 0.35
    };
    console.log('\nHeadBox candidate:', headBox);
    try {
      const cRes = await classifier.run(frame, headBox);
      console.log('Classifier on headBox:', cRes);
    } catch(e) { console.log('Classifier err:', e); }

    try {
      const heRes = await headEvidence.run(frame, headBox);
      console.log('headEvidence on headBox:', heRes);
    } catch(e) { console.log('headEvidence err:', e); }
  }

  await manager.shutdown();
}

main().catch(console.error);
