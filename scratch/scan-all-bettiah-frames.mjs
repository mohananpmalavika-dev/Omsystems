import fs from 'node:fs';
import path from 'node:path';
import { loadRgbFrame } from '../analytics-engine/scripts/helmet-replay.mjs';

async function scanAll() {
  const { getModelManager } = await import('../analytics-engine/dist/analytics-engine/src/model-manager.js');
  const { loadObjectInference, loadHelmetClassificationInference } =
    await import('../analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js');

  const manager = getModelManager({
    modelsDirectory: path.resolve('analytics-engine/models'),
    enableGPU: false
  });
  await manager.initialize();

  const yolo = await loadObjectInference('yolov8n', 0.25);
  const localizer = await loadObjectInference('helmet-head-localizer', 0.15);
  const classifier = await loadHelmetClassificationInference('helmet');
  const headEvidence = await loadHelmetClassificationInference('helmet-head-evidence');

  for (const ch of ['ch2', 'ch5']) {
    console.log(`\n=================== SCANNING ${ch.toUpperCase()} ===================`);
    const dir = path.resolve(`scratch/bettiah-entry-20261008/${ch}`);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const frame = await loadRgbFrame({ file: fullPath, capturedAt: '2026-10-08T04:37:30Z' }, 'cam');
      const objects = await yolo.run(frame);
      const persons = objects.filter(o => o.label === 'person');
      const heads = await localizer.run(frame);

      if (persons.length > 0 || heads.length > 0) {
        console.log(`\n[${ch} ${file}] Persons: ${persons.length}, Heads/Helmets: ${heads.length}`);
        for (const p of persons) {
          console.log(`   Person: conf=${p.confidence?.toFixed(2)} box=[x:${p.boundingBox.x.toFixed(2)}, y:${p.boundingBox.y.toFixed(2)}, w:${p.boundingBox.width.toFixed(2)}, h:${p.boundingBox.height.toFixed(2)}] hPx=${(p.boundingBox.height * frame.height).toFixed(0)}`);
          
          // Test head crop with classifier & head evidence
          const headBox = {
            x: Math.max(0, p.boundingBox.x + p.boundingBox.width * 0.05),
            y: Math.max(0, p.boundingBox.y - p.boundingBox.height * 0.05),
            width: Math.min(1, p.boundingBox.width * 0.9),
            height: Math.min(1, p.boundingBox.height * 0.35)
          };
          const cRes = await classifier.run(frame, headBox);
          const heRes = await headEvidence.run(frame, headBox);
          console.log(`   -> Classifier: wearing=${cRes.wearingHelmet} conf=${cRes.wearingHelmetConfidence.toFixed(3)} | HeadEvidence: wearing=${heRes.wearingHelmet} conf=${heRes.wearingHelmetConfidence.toFixed(3)}`);
        }
        for (const h of heads) {
          console.log(`   Localizer: label=${h.label} conf=${h.confidence?.toFixed(2)} box=[x:${h.boundingBox.x.toFixed(2)}, y:${h.boundingBox.y.toFixed(2)}, w:${h.boundingBox.width.toFixed(2)}, h:${h.boundingBox.height.toFixed(2)}]`);
        }
      }
    }
  }

  await manager.shutdown();
}

scanAll().catch(console.error);
