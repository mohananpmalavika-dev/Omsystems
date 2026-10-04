import sharp from 'sharp';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});await manager.initialize();
try{const objects=await loadObjectInference('yolov8n',.35);const classifier=await loadHelmetClassificationInference('helmet');const output=[];
for(const file of ['scratch/helmet-alert-ch6.jpg','scratch/helmet-alert-ch2.jpg','scratch/helmet-alert-ch8.jpg','tmp/helmet-channel-6.jpg','tmp/false-helmet-6e8bb747-de8e-4eb2-9159-272e370f0e87.jpg','tmp/false-helmet-b5642331-f399-4a7a-a091-26eb293eeef9.jpg']){
const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});const frame={cameraId:file,tenantId:'crop-study',timestamp:new Date(),imageData:data,width:info.width,height:info.height};const detected=await objects.run(frame);const persons=detected.filter(o=>o.label==='person');const samples=[];
for(const person of persons){const b=person.boundingBox;const crops=[];for(const h of [.15,.2,.25,.3,.35])for(const w of [.6,.8,1,1.3]){
const x=Math.max(0,b.x+(1-w)*b.width*.5);const box={x,y:b.y,width:Math.min(1-x,b.width*w),height:Math.min(1-b.y,b.height*h)};const r=await classifier.run(frame,box);crops.push({h,w,p:r.wearingHelmetConfidence});}
samples.push({person,crops});}
output.push({file,samples});console.log(JSON.stringify({file,samples}));}
await writeFile('reports/helmet-crop-study-2026-10-04.json',JSON.stringify(output,null,2));}finally{await manager.shutdown();}process.exit(0);
