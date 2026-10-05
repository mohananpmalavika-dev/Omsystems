import sharp from 'sharp';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35);
 const classifier=await loadHelmetClassificationInference('helmet');
 const output=[];
 for(const file of [
  ...['1791198447042','1791198062802','1791197215378','1791120703973'].map(id=>'C:/Users/Dhanya/Downloads/incident-snapshot-'+id+'.jpg'),
  'scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg',
 ]) {
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const persons=(await objects.run(frame)).filter(o=>o.label==='person');
  const results=[];
  for(const person of persons) {
   const b=person.boundingBox; const crops=[];
   for(const offset of [-.15,-.10,-.05,0]) for(const height of [.15,.20,.25,.30]) for(const width of [.6,.8,1]) {
    const y=Math.max(0,b.y+b.height*offset);
    const box={x:b.x+b.width*(1-width)/2,y,width:b.width*width,height:Math.min(1-y,b.height*height)};
    crops.push({offset,height,width,score:(await classifier.run(frame,box)).wearingHelmetConfidence});
   }
   results.push({person,crops});
  }
  output.push({file,results});
 }
 await writeFile('reports/helmet-bettaih-raised-crop-study.json',JSON.stringify(output,null,2));
 const falseHead=output[0]!.results[0]!;
 const wearer=output[3]!.results[0]!;
 console.log(JSON.stringify(falseHead.crops.map(c=>({...c,falseScore:c.score,wearerScore:wearer.crops.find(w=>w.offset===c.offset&&w.height===c.height&&w.width===c.width)!.score})).filter(c=>c.wearerScore>.90&&c.falseScore<.90),null,2));
} finally {await manager.shutdown();}
process.exit(0);
