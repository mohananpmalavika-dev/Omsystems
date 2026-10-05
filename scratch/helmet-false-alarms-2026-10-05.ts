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
 const files=[...['f5781a86-8527-4a30-a94a-3f256555fbcb','f0b4f55e-00c0-442c-a0e1-3d6a05150bdf','6fbdbee4-1d81-40f9-835d-33e8a93a7486'].map(id=>'scratch/helmet-false-'+id+'.jpg'),...['1791186559923','1791184490611','1791184490611 (1)','1791120703973'].map(id=>'C:/Users/Dhanya/Downloads/incident-snapshot-'+id+'.jpg'),'scratch/helmet-new-false-alert-raw.jpg','scratch/helmet-alert-ch6.jpg','scratch/helmet-alert-ch2.jpg','scratch/helmet-alert-ch8.jpg','tmp/helmet-channel-6.jpg'];
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
 await writeFile('reports/helmet-false-alarms-2026-10-05-study.json',JSON.stringify(output,null,2));
}finally{await manager.shutdown();}
process.exit(0);
