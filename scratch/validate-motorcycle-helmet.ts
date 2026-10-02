import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getModelManager } from '../analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference } from '../analytics-engine/src/inference/configured-model-inference.js';
import { HelmetDetector } from '../analytics-engine/src/detectors/helmet-detector.js';

const manager = getModelManager({
  modelsDirectory: path.resolve('analytics-engine/models'), enableGPU: false, startCleanupTimer: false,
});
await manager.initialize();
try {
  const classifier = await loadHelmetClassificationInference('helmet');
  const detector = new HelmetDetector(null, 0.88, classifier);
  await detector.initialize();
  const samples = [
    { channel: 6, expectedAlert: true, confidence: .9165022142924926,
      box: { x: .30443606529365325, y: .21965613695855002, width: .27801713454647775, height: .78034386304145 } },
    { channel: 7, expectedAlert: false, confidence: .7353703658791488,
      box: { x: .649884984365354, y: .027898427026106384, width: .3039204354276641, height: .9645983759720762 } },
  ];
  const evidence: Record<string, unknown>[] = [];
  for (const sample of samples) {
    const { data, info } = await sharp(`tmp/helmet-channel-${sample.channel}.jpg`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const frame = {
      cameraId: `replay-channel-${sample.channel}`, tenantId: 'local-replay',
      timestamp: new Date('2026-10-02T15:00:00Z'), imageData: data, width: info.width, height: info.height,
      metadata: { inferenceMode: 'local-onnx', detections: [{ label: 'person', confidence: sample.confidence, boundingBox: sample.box }] },
    };
    const first = await detector.detect(frame);
    const repeated = await detector.detect(frame);
    const second = await detector.detect({ ...frame, timestamp: new Date('2026-10-02T15:00:02Z') });
    assert.equal(first.length, 0, 'A single classifier-only observation must not alert');
    assert.equal(repeated.length, 0, 'Repeating the same timestamp must not confirm an alert');
    assert.equal(second.some(result => result.detectionType === 'helmet-worn'), sample.expectedAlert);
    if (sample.expectedAlert) assert.ok(second[0]!.confidence! >= .9167);
    evidence.push({ channel: sample.channel, expectedAlert: sample.expectedAlert,
      firstFrameAlerts: first.length, duplicateFrameAlerts: repeated.length,
      secondFrameAlerts: second.length, confidence: second[0]?.confidence ?? null });
  }
  const negative = await sharp('tmp/helmet-negative-paddle.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cap = await classifier.run({
    cameraId: 'cap-control', tenantId: 'local-replay', timestamp: new Date(),
    imageData: negative.data, width: negative.info.width, height: negative.info.height,
  }, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(cap.wearingHelmet, false);
  evidence.push({ control: 'cap-only', wearingHelmetConfidence: cap.wearingHelmetConfidence });
  const report = { model: manager.getModelConfig('helmet'), mode: 'local cached-image replay; no production alerts submitted', evidence };
  await writeFile('reports/helmet-worn-replay-2026-10-02.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  await detector.cleanup();
} finally {
  await manager.shutdown();
}
