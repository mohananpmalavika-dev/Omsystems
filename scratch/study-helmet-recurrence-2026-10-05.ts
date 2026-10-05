import sharp from 'sharp';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35), classifier=await loadHelmetClassificationInference('helmet');
 const file='C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg';
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:file,tenantId:'isolated-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const detections=await objects.run(frame),scores=[];
 for(const person of detections.filter(o=>o.label==='person')) {
  const b=person.boundingBox,crops=[];
  for(const offset of [-.2,-.15,-.1,-.05,0]) for(const h of [.15,.2,.25,.3,.35,.55]) for(const w of [.4,.6,.8,1,1.3]) {
   const y=Math.max(0,b.y+b.height*offset),x=Math.max(0,b.x+b.width*(1-w)/2);
   crops.push({offset,h,w,score:(await classifier.run(frame,{x,y,width:Math.min(1-x,b.width*w),height:Math.min(1-y,b.height*h)})).wearingHelmetConfidence});
  }
  scores.push({person,crops});
 }
 const alerts=[];
 for(const fastAlert of [false,true]) {
  const detector=new HelmetDetector(null,.88,classifier,fastAlert);await detector.initialize();
  const counts=[];
  for(const seconds of [0,0,2,4])counts.push((await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}})).length);
  alerts.push({fastAlert,counts});await detector.cleanup();
 }
 await writeFile('reports/helmet-recurrence-2026-10-05-study.json',JSON.stringify({file,detections,scores,alerts},null,2));
 console.log(JSON.stringify({detections,alerts}));
} finally {await manager.shutdown();}
process.exit(0);
