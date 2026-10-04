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
 const file='C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg';
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'isolated-missed-helmet',tenantId:'isolated-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const detections=await objects.run(frame); const persons=detections.filter(o=>o.label==='person');const scores=[];
 for(const person of persons){const b=person.boundingBox;
  const upper={x:Math.max(0,b.x-b.width*.15),y:Math.max(0,b.y-b.height*.15),width:Math.min(1-Math.max(0,b.x-b.width*.15),b.width*1.3),height:Math.min(1-Math.max(0,b.y-b.height*.15),b.height*.55)};
  const crops=[upper,{x:b.x+b.width*.1,y:b.y,width:b.width*.8,height:b.height*.35},{x:b.x,y:b.y,width:b.width,height:b.height*.15},{x:b.x+b.width*.1,y:b.y,width:b.width*.8,height:b.height*.15}];
  scores.push({person,crops:await Promise.all(crops.map(async box=>({box,...await classifier.run(frame,box)})))});
 }
 const detector=new HelmetDetector(null,.88,classifier);await detector.initialize();const alerts=[];
 for(const seconds of [0,2,4])alerts.push(await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}}));
 const result={mode:'isolated static replay; no events submitted',file,detectorVersion:detector.modelVersion,detections,scores,alerts};
 console.log(JSON.stringify(result));await writeFile('reports/helmet-missing-alert-replay-2026-10-04.json',JSON.stringify(result,null,2));await detector.cleanup();
}finally{await manager.shutdown();}
process.exit(0);
