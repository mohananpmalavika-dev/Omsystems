import sharp from 'sharp';
import {access,writeFile} from 'node:fs/promises';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const results=[];
try {
 const classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 const files=['C:/Users/Dhanya/Downloads/incident-snapshot-1791291164726.jpg','C:/Users/Dhanya/Downloads/incident-snapshot-1791291349745.jpg','C:/Users/Dhanya/Downloads/incident-snapshot-1791291808938.jpg',...Array.from({length:3},(_,i)=>`scratch/helmet-rajkot-original-${i}.jpg`),'scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg','scratch/helmet-new-false-alert-raw.jpg'];
 for(const file of files){try{await access(file);}catch{continue;}
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const heads=await localizer.run(frame);
  for(const head of heads){const b=head.boundingBox,scores=[];
   for(const h of [1,.65])for(const p of [0,.15,.3,.5,.75]){
    const x=Math.max(0,b.x-b.width*p),y=Math.max(0,b.y-b.height*p);
    const box={x,y,width:Math.min(1,b.x+b.width*(1+p))-x,height:Math.min(1,b.y+b.height*(h+p))-y};
   const score=await classifier.run(frame,box);scores.push({h,p,score:score.wearingHelmetConfidence});
   }
   for(const h of [1,.65]){
    // Include the shell's sides while keeping the crown alternative above the exposed face.
    const x=Math.max(0,b.x-b.width*.3),y=Math.max(0,b.y-b.height*.15);
    const box={x,y,width:Math.min(1,b.x+b.width*1.3)-x,height:Math.min(1,b.y+b.height*(h+.15))-y};
    scores.push({h,p:'wide',score:(await classifier.run(frame,box)).wearingHelmetConfidence});
   }
   const row={file,head,scores};results.push(row);console.log(JSON.stringify(row));
  }
 }
 await writeFile('reports/helmet-context-study-2026-10-06.json',JSON.stringify(results,null,2));
}finally{await manager.shutdown();}process.exit(0);
