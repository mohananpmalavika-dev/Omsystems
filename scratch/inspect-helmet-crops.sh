set -e
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
const headers = { 'x-analytics-source-key': process.env.ANALYTICS_ENGINE_SHARED_KEY };
const health = await (await fetch('http://localhost:8092/health')).json();
console.log('HEALTH', JSON.stringify({ state: health.aiState, received: health.received, accepted: health.accepted, lastAcceptedAt: health.lastAcceptedAt, helmet: health.pipeline?.detectors?.helmet }));
const manager = getModelManager();
await manager.initialize();
const objects = await loadObjectInference('yolov8n', 0.35);
const classifier = await loadHelmetClassificationInference('helmet');
for (const [channel, cameraId] of [[6,'9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc'],[7,'8f7e6ca9-d45e-459e-a11c-70ed9d37b411']]) {
  const response = await fetch(`http://localhost:8092/internal/analytics/snapshots/${cameraId}`, { headers });
  if (!response.ok) { console.log('SNAPSHOT', channel, response.status); continue; }
  const jpeg = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(`/tmp/helmet-channel-${channel}.jpg`, jpeg);
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = { cameraId, tenantId: 'diagnostic', timestamp: new Date(), imageData: data, width: info.width, height: info.height };
  const detections = await objects.run(frame);
  console.log('OBJECTS', channel, JSON.stringify(detections));
  for (const person of detections.filter(item => item.label === 'person')) {
    const b = person.boundingBox;
    const x = Math.max(0, b.x - b.width * 0.15), y = Math.max(0, b.y - b.height * 0.15);
    const upper = { x, y, width: Math.min(1-x, b.width*1.3), height: Math.min(1-y,b.height*0.55) };
    const head = { x: b.x+b.width*0.1, y:b.y, width:b.width*0.8, height:b.height*0.35 };
    console.log('CROPS', channel, JSON.stringify({ person, upper: await classifier.run(frame,upper), head: await classifier.run(frame,head) }));
  }
}
await manager.shutdown();
process.exit(0);
JS
sudo docker cp sentinel-gcp-analytics-engine:/tmp/helmet-channel-6.jpg /tmp/helmet-channel-6.jpg
sudo docker cp sentinel-gcp-analytics-engine:/tmp/helmet-channel-7.jpg /tmp/helmet-channel-7.jpg
