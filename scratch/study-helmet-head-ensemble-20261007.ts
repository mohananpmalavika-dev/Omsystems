import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {HelmetClassificationInference} from '../analytics-engine/src/inference/vision-specialty-inference.js';
const inputs=JSON.parse(await readFile('reports/kollam-localization-study-2026-10-07.json','utf8'));
const rows=[];
for(const variant of ['v5','v5b','v5c']) {
 const session=await InferenceSession.create('tmp/helmet-localizer-candidates/helmet_'+variant+'.onnx',{executionProviders:['cpu'],intraOpNumThreads:2});
 try {
  const classifier=new HelmetClassificationInference(session,224,224,'imagenet-stretch',true);
  for(const item of inputs) {
   const {data,info}=await sharp(item.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const frame={cameraId:item.file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
   const heads=[];
   for(const head of item.full) {
    const b=head.boundingBox;
    const scores=[];
    for(const p of [0,.15]) {
     const x=Math.max(0,b.x-b.width*p),y=Math.max(0,b.y-b.height*p);
     const c={x,y,width:Math.min(1,b.x+b.width*(1+p))-x,height:Math.min(1,b.y+b.height*(1+p))-y};
     scores.push((await classifier.run(frame,c)).wearingHelmetConfidence);
    }
    heads.push({head,scores});
   }
   const row={variant,file:item.file,heads};rows.push(row);console.log(JSON.stringify(row));
  }
 }finally{await session.release();}
}
await writeFile('reports/helmet-head-ensemble-study-2026-10-07.json',JSON.stringify(rows,null,2));
process.exit(0);
