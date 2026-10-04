import sharp from 'sharp';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});await manager.initialize();
try{const objects=await loadObjectInference('yolov8n',.35);const classifier=await loadHelmetClassificationInference('helmet');const output=[];
for(const file of ['C:/Users/Dhanya/Downloads/incident-snapshot-1791120703973.jpg','scratch/helmet-new-false-alert-raw.jpg','scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg',...['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219'].map(id=>'C:/Users/Dhanya/Downloads/incident-snapshot-'+id+'.jpg')]){
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};const detections=await objects.run(frame);const trials=[];
 for(const person of detections.filter(o=>o.label==='person' && (o.confidence??0)>=.65)){const b=person.boundingBox;
 for(const padding of [.15,.3,.5]){const left=Math.max(0,Math.floor((b.x-b.width*padding)*info.width));const top=Math.max(0,Math.floor((b.y-b.height*padding)*info.height));const width=Math.min(info.width-left,Math.ceil(b.width*(1+2*padding)*info.width));const height=Math.min(info.height-top,Math.ceil(b.height*(1+2*padding)*info.height));const rgb=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).extract({left,top,width,height}).raw().toBuffer();
 const refined=(await objects.run({...frame,imageData:rgb,width,height})).filter(o=>o.label==='person').map(o=>({...o,boundingBox:{x:(left+o.boundingBox.x*width)/info.width,y:(top+o.boundingBox.y*height)/info.height,width:o.boundingBox.width*width/info.width,height:o.boundingBox.height*height/info.height}}));
 const detector=new HelmetDetector(null,.88,classifier);await detector.initialize();const alerts=[];for(const seconds of [0,2,4])alerts.push(await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections:refined}}));await detector.cleanup();trials.push({padding,refined,alerts:alerts.map(a=>a.length)});
 }}output.push({file,detections,trials});console.log(JSON.stringify(output.at(-1)));
}await writeFile('reports/helmet-person-refinement-study.json',JSON.stringify(output,null,2));}finally{await manager.shutdown();}process.exit(0);
