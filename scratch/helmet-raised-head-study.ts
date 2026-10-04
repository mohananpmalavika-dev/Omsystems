import sharp from 'sharp';import path from 'node:path';import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});await manager.initialize();
try{const objects=await loadObjectInference('yolov8n',.35);const classifier=await loadHelmetClassificationInference('helmet');const output=[];
for(const file of ['C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg','scratch/helmet-new-false-alert-raw.jpg','C:/Users/Dhanya/Downloads/incident-snapshot-1791111334054.jpg','scratch/helmet-alert-ch6.jpg','scratch/helmet-alert-ch2.jpg','scratch/helmet-alert-ch8.jpg','tmp/helmet-channel-6.jpg',...['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219'].map(id=>'C:/Users/Dhanya/Downloads/incident-snapshot-'+id+'.jpg')]){
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};const detections=await objects.run(frame);const scores=[];
 for(const person of detections.filter(o=>o.label==='person')){const b=person.boundingBox;const crops=[];
 for(const w of [1,.8]){const y=Math.max(0,b.y-b.height*.15);const box={x:b.x+b.width*(1-w)/2,y,width:b.width*w,height:Math.min(1-y,b.height*.25)};crops.push({box,...await classifier.run(frame,box)});}scores.push({person,crops});}
 output.push({file,scores});console.log(JSON.stringify(output.at(-1)));
}await writeFile('reports/helmet-raised-head-study.json',JSON.stringify(output,null,2));}finally{await manager.shutdown();}process.exit(0);
