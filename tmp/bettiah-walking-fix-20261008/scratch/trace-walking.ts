import fs from 'node:fs';import sharp from 'sharp';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35),localizer=await loadObjectInference('helmet-head-localizer',.25);
const old=await loadHelmetClassificationInference('helmet'),head=await loadHelmetClassificationInference('helmet-head-evidence');
const rows=[];let trace:any[]=[];
const wrappedLocalizer={run:async(f:any)=>{const result=await localizer.run(f);trace.push({kind:'localizer',width:f.width,height:f.height,result});return result;}};
const wrappedHead={run:async(f:any,box:any)=>{const result=await head.run(f,box);trace.push({kind:'classifier',box,result});return result;}};
const verifier=new LocalizedHelmetHeadVerifier(wrappedLocalizer,old,null,null,wrappedHead);
try{for(const index of [36,37]){
 const file='scratch/bettiah-entry-20261008/ch5/frame-'+String(index).padStart(3,'0')+'.jpg';
 const {data,info}=await sharp(file).resize(640,360).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'offline-trace',tenantId:'isolated',timestamp:new Date(index*2000),width:info.width,height:info.height,imageData:data,metadata:{inferenceMode:'local-onnx',detections:[] as any[]}};
 frame.metadata.detections=await objects.run(frame);trace=[];
 const persons=frame.metadata.detections.filter(p=>p.label==='person');const verified=[];
 for(const p of persons)verified.push({person:p,result:await verifier.verify(frame,p.boundingBox,.8)});
 rows.push({file,verified,trace,eventsSubmitted:0});
}fs.writeFileSync('reports/presentation-walking-trace-2026-10-08.json',JSON.stringify({rows},null,2));}
finally{await manager.shutdown();}process.exit(0);
