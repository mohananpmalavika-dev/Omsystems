import fs from 'node:fs';import sharp from 'sharp';import {Tensor} from 'onnxruntime-node';import {createHash} from 'node:crypto';
import {getModelManager} from '../tmp/presentation-helmet-native-retry-20261008/analytics-engine/src/model-manager.js';
import {cropRgb24} from '../tmp/presentation-helmet-native-retry-20261008/analytics-engine/src/inference/vision-specialty-inference.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const session:any=await manager.getModel('helmet-head-evidence');const rows=[];
try{for(const [resolution,traceFile] of [[640,'reports/presentation-walking-trace-2026-10-08.json'],[960,'reports/presentation-walking-hd-trace-2026-10-08.json']] as const){
 const row=JSON.parse(fs.readFileSync(traceFile,'utf8')).rows.find((r:any)=>r.file.endsWith('frame-036.jpg'));
 const expanded=row.trace.find((r:any)=>r.kind==='classifier').box;
 const width=expanded.width/1.3,height=expanded.height/1.3;
 const box={x:expanded.x+width*.15,y:expanded.y+height*.15,width,height};
 const {data,info}=await sharp(row.file).resize(resolution,resolution*9/16).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'isolated-feedback',tenantId:'offline',timestamp:new Date(0),width:info.width,height:info.height,imageData:data};
 for(const padding of [.15,.25]){
  const crop=cropRgb24(frame,{x:box.x-width*padding,y:box.y-height*padding,width:width*(1+2*padding),height:height*(1+2*padding)});
  const pixels=await sharp(crop.imageData,{raw:{width:crop.width,height:crop.height,channels:3}}).resize(224,224,{fit:'cover',position:'centre',kernel:'cubic'}).raw().toBuffer();
  const chw=new Float32Array(3*224*224),mean=[.48145466,.4578275,.40821073],std=[.26862954,.26130258,.27577711];
  for(let i=0;i<224*224;i++)for(let c=0;c<3;c++)chw[c*224*224+i]=(pixels[i*3+c]!/255-mean[c]!)/std[c]!;
  const output=await session.run({[session.inputNames[0]]:new Tensor('float32',chw,[1,3,224,224])});
  const embedding=Array.from(output.image_embeds.data as Float32Array),norm=Math.hypot(...embedding);
  rows.push({file:row.file,sourceSha256:createHash('sha256').update(fs.readFileSync(row.file)).digest('hex'),
    resolution,group:'bettiah-bent-forward-feedback',split:'train',expectedHelmet:true,head:box,padding,feature:embedding.map(v=>v/norm)});
 }
}fs.writeFileSync('reports/bettiah-walking-feedback-features-2026-10-08.json',JSON.stringify(rows));
console.log(JSON.stringify({trainingFrames:1,crops:rows.length,feedback:'Confirmed visible worn helmet at 10:08:13 IST; this image is training feedback, not held-out validation'}));}
finally{await manager.shutdown();}process.exit(0);
