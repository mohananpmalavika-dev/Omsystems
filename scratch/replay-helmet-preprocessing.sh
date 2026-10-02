set -e
sudo docker cp /tmp/helmet-preprocessing-replay.js sentinel-gcp-analytics-engine:/app/dist/analytics-engine/src/inference/helmet-preprocessing-replay.js
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import sharp from 'sharp';
import { InferenceSession } from 'onnxruntime-node';
import { HelmetClassificationInference as Fixed } from '/app/dist/analytics-engine/src/inference/helmet-preprocessing-replay.js';
import { HelmetClassificationInference as Previous } from '/app/dist/analytics-engine/src/inference/vision-specialty-inference.js';
const session = await InferenceSession.create('/app/models/safety/helmet.onnx', { executionProviders: ['cpu'] });
const fixed = new Fixed(session), previous = new Previous(session);
for (const channel of [6, 7]) {
  const { data, info } = await sharp(`/tmp/helmet-channel-${channel}.jpg`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = { cameraId: `camera-${channel}`, tenantId: 'diagnostic', timestamp: new Date(), imageData: data, width: info.width, height: info.height };
  const b = channel === 6
    ? { x: .30443606529365325, y: .21965613695855002, width: .27801713454647775, height: .78034386304145 }
    : { x: .649884984365354, y: .027898427026106384, width: .3039204354276641, height: .9645983759720762 };
  const x = Math.max(0,b.x-b.width*.15), y=Math.max(0,b.y-b.height*.15);
  for (const [name, box] of Object.entries({
    upper: { x, y, width: Math.min(1-x,b.width*1.3), height: Math.min(1-y,b.height*.55) },
    head: { x:b.x+b.width*.1,y:b.y,width:b.width*.8,height:b.height*.35 },
    tightHead: { x:b.x+b.width*.15,y:Math.max(0,b.y-b.height*.04),width:b.width*.7,height:b.height*.25 },
  })) console.log('REPLAY', channel,name,JSON.stringify({ previous: await previous.run(frame,box), fixed: await fixed.run(frame,box) }));
}
await session.release();
process.exit(0);
JS
