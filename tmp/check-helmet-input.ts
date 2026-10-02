import sharp from 'sharp';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { HelmetClassificationInference, cropRgb24 } from '../analytics-engine/src/inference/vision-specialty-inference.js';
import { resizeRgb24ToChw } from '../analytics-engine/src/inference/yolo-detection-inference.js';
const session = await InferenceSession.create(process.argv[2] ?? 'tmp/helmet-production.onnx', { executionProviders: ['cpu'] });
const classifier = new HelmetClassificationInference(session);
console.log('MODEL', session.inputNames, session.outputNames, session.inputMetadata);
for (const channel of [6, 7]) {
  const { data, info } = await sharp(`tmp/helmet-channel-${channel}.jpg`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = { cameraId: `camera-${channel}`, tenantId: 'diagnostic', timestamp: new Date(), imageData: data, width: info.width, height: info.height };
  const b = channel === 6
    ? { x: .30443606529365325, y: .21965613695855002, width: .27801713454647775, height: .78034386304145 }
    : { x: .649884984365354, y: .027898427026106384, width: .3039204354276641, height: .9645983759720762 };
  const x = Math.max(0,b.x-b.width*.15), y=Math.max(0,b.y-b.height*.15);
  for (const [name, box] of Object.entries({
    upper: { x, y, width: Math.min(1-x,b.width*1.3), height: Math.min(1-y,b.height*.55) },
    head: { x:b.x+b.width*.1,y:b.y,width:b.width*.8,height:b.height*.35 },
    tightHead: { x:b.x+b.width*.15,y:b.y-b.height*.04,width:b.width*.7,height:b.height*.25 },
  })) {
    if (process.argv[2]) {
      const crop = cropRgb24(frame, box);
      const pixels = await sharp(crop.imageData, { raw: {width:crop.width,height:crop.height,channels:3} }).resize(224,224,{fit:'fill',kernel:'linear'}).raw().toBuffer();
      const chw = resizeRgb24ToChw(pixels,224,224,224,224,(v,c)=>(v/255-[.485,.456,.406][c!])/([.229,.224,.225][c!]));
      const result = await session.run({[session.inputNames[0]]: new Tensor('float32',chw,[1,3,224,224])});
      const scores = Array.from(result[session.outputNames[0]].data) as number[];
      const exp = scores.map(v=>Math.exp(v-Math.max(...scores)));
      console.log(channel,name,JSON.stringify({scores,wearingHelmetConfidence:exp[0]/(exp[0]+exp[1])}));
    } else console.log(channel,name,JSON.stringify(await classifier.run(frame,box)));
  }
}
if (process.argv[2]) {
  for (const file of ['tmp/helmet-negative-paddle.png']) {
    const pixels = await sharp(file).removeAlpha().resize(224,224,{fit:'fill',kernel:'linear'}).raw().toBuffer();
    const chw = resizeRgb24ToChw(pixels,224,224,224,224,(v,c)=>(v/255-[.485,.456,.406][c!])/([.229,.224,.225][c!]));
    const result = await session.run({[session.inputNames[0]]:new Tensor('float32',chw,[1,3,224,224])});
    const scores=Array.from(result[session.outputNames[0]].data) as number[];
    const exp=scores.map(v=>Math.exp(v-Math.max(...scores)));
    console.log('NEGATIVE',file,JSON.stringify({scores,wearingHelmetConfidence:exp[0]/(exp[0]+exp[1])}));
  }
}
await session.release();
process.exit(0);
