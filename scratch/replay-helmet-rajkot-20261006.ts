import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35);
 const classifier=await loadHelmetClassificationInference('helmet');
 const localizer=await loadObjectInference('helmet-head-localizer',.25);
 const file=process.argv[2] ?? 'C:/Users/Dhanya/Downloads/incident-snapshot-1791291164726.jpg';
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'isolated-rajkot',tenantId:'isolated-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const detections=await objects.run(frame), heads=await localizer.run(frame);
 const scores=[];
 for(const head of heads){
  const b=head.boundingBox,p=.15,x=Math.max(0,b.x-b.width*p),y=Math.max(0,b.y-b.height*p);
  const crops=[b,{x,y,width:Math.min(1,b.x+b.width*(1+p))-x,height:Math.min(1,b.y+b.height*(1+p))-y},{...b,height:b.height*.65}];
  scores.push({head,crops:await Promise.all(crops.map(async box=>({box,...await classifier.run(frame,box)})))});
 }
 const verifier=new LocalizedHelmetHeadVerifier(localizer,classifier);
 const verification=await Promise.all(detections.filter(o=>o.label==='person').map(async person=>({person,verified:await verifier.verify(frame,person.boundingBox,.9167)})));
 const counts=[];
 for(const fast of [false,true]){
  const detector=new HelmetDetector(null,.88,classifier,fast,verifier);await detector.initialize();
  const results=[];
  for(const seconds of [0,0,2,4])results.push(await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}}));
  counts.push({fast,results});await detector.cleanup();
 }
 const result={file,detections,scores,verification,counts};
 await writeFile('reports/helmet-rajkot-replay-2026-10-06.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await manager.shutdown();}
process.exit(0);
