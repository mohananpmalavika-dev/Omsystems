import sharp from 'sharp';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
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
    { name:'original-bare-head', file:'tmp/false-helmet-6e8bb747-de8e-4eb2-9159-272e370f0e87.jpg', expectedAlert:false },
    { name:'original-empty-chair', file:'tmp/false-helmet-b5642331-f399-4a7a-a091-26eb293eeef9.jpg', expectedAlert:false },
    { name:'attached-bare-head', file:'C:/Users/Dhanya/Downloads/incident-snapshot-1791006290219.jpg', expectedAlert:false },
    { name:'attached-empty-chair', file:'C:/Users/Dhanya/Downloads/incident-snapshot-1791006278468 (1).jpg', expectedAlert:false },
    { name:'known-motorcycle-helmet', file:'tmp/helmet-channel-6.jpg', expectedAlert:true },
  ];
  for (const {name,file,expectedAlert} of samples) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const frame = { cameraId: name, tenantId: 'local-replay', timestamp: new Date(0), imageData: data, width: info.width, height: info.height };
    const detections = await objects.run(frame);
    const alerts = [];
    for (const seconds of [0,2,4]) {
      const results = await detector.detect({ ...frame, timestamp: new Date(seconds*1000), metadata:{ inferenceMode:'local-onnx', detections } });
      assert.equal(results.some(r => r.detectionType === 'helmet-worn'), seconds > 0 && expectedAlert, name);
      alerts.push(results);
    }
    evidence.push({sample:name,expectedAlert,personConfidence:detections.filter(o=>o.label==='person').map(o=>o.confidence),alertsPerFrame:alerts.map(a=>a.length),helmetConfidence:alerts[1]?.[0]?.confidence??null});
  }
  await writeFile('reports/helmet-false-alarm-replay-2026-10-03.json',JSON.stringify({mode:'local replay; no production events submitted',detectorVersion:'1.1.1',evidence},null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
  await detector.cleanup();
} finally { await manager.shutdown(); }
