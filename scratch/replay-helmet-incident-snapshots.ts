import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getModelManager } from '../analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '../analytics-engine/src/inference/configured-model-inference.js';
import { HelmetDetector } from '../analytics-engine/src/detectors/helmet-detector.js';

const manager = getModelManager({ modelsDirectory: path.resolve('analytics-engine/models'), enableGPU: false, startCleanupTimer: false });
await manager.initialize();
try {
  const objects = await loadObjectInference('yolov8n', .35);
  const classifier = await loadHelmetClassificationInference('helmet');
  const detector = new HelmetDetector(null, .88, classifier);
  await detector.initialize();
  const evidence = [];
  const samples = [
    ...['1791040935773', '1791040925724', '1791040917135', '1791040909261', '1791006290219'].map(id => ({
      name: `incident-${id}`, file: `C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`, expectedAlert: false,
    })),
    { name: 'known-motorcycle-helmet', file: 'tmp/helmet-channel-6.jpg', expectedAlert: true },
  ];
  for (const {name, file, expectedAlert} of samples) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const frame = { cameraId: name, tenantId: 'local-replay', timestamp: new Date(0), imageData: data, width: info.width, height: info.height };
    const detections = await objects.run(frame);
    const alerts = [];
    for (const seconds of [0, 2, 4]) {
      const results = await detector.detect({ ...frame, timestamp: new Date(seconds * 1000), metadata: { inferenceMode: 'local-onnx', detections } });
      assert.equal(results.some(r => r.requiresAlert), seconds > 0 && expectedAlert, name);
      alerts.push(results);
    }
    const sample = { sample: name, expectedAlert, persons: detections.filter(o => o.label === 'person'), alertsPerFrame: alerts.map(a => a.length), alerts: alerts[1] };
    evidence.push(sample);
    console.log(JSON.stringify(sample));
  }
  await writeFile('reports/helmet-incident-snapshots-replay-2026-10-03.json', JSON.stringify({ mode: 'local static-image replay; no production events submitted', detectorVersion: '1.1.1', evidence }, null, 2) + '\n');
  await detector.cleanup();
} finally { await manager.shutdown(); }
