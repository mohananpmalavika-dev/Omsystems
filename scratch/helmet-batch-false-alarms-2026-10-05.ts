import sharp from 'sharp';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35);
 const classifier=await loadHelmetClassificationInference('helmet');
 const output=[];
 const files=['1791198654463', '1791198648992', '1791198638949', '1791198631468', '1791198624761', '1791198615130', '1791198609384', '1791198601048', '1791198591579', '1791198582436', '1791198577964', '1791198565877', '1791198560177', '1791198549081', '1791198529305', '1791198447042', '1791198062802', '1791197215378', '1791190779442', '1791190768950'].map(id=>'C:/Users/Dhanya/Downloads/incident-snapshot-'+id+'.jpg').concat(['C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg','scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg']);
 for(const file of files){
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const detections=await objects.run(frame);const scores=[];
  for(const person of detections.filter(o=>o.label==='person')){
   const b=person.boundingBox;const crops=[];
   for(const [offset,h,w] of [[0,.55,1],[0,.35,1],[0,.15,1],[0,.15,.8],[-.15,.25,1],[-.15,.25,.8],[0,.25,.8],[0,.2,.6],[0,.3,.6]]){
    const y=Math.max(0,b.y+b.height*offset);const box={x:b.x+b.width*(1-w)/2,y,width:b.width*w,height:Math.min(1-y,b.height*h)};
    crops.push({offset,h,w,...await classifier.run(frame,box)});
   }scores.push({person,crops});
  }
  const detector=new HelmetDetector(null,.88,classifier,true);await detector.initialize();const alerts=[];
  for(const seconds of [0,2,4])alerts.push(await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}}));
  output.push({file,scores,alerts});
  console.log(JSON.stringify({file,scores:scores.map(s=>({person:s.person,crops:s.crops.map(c=>[c.offset,c.h,c.w,+c.wearingHelmetConfidence.toFixed(5)])})),alerts:alerts.map(a=>a.map(r=>r.objects))}));
  await detector.cleanup();
 }
 await writeFile('reports/helmet-batch-false-alarms-2026-10-05-study.json',JSON.stringify(output,null,2));
}finally{await manager.shutdown();}
process.exit(0);
