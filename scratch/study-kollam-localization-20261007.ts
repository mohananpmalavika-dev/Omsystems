import sharp from 'sharp';
import {access,writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
const rows=[];
try {
 const objects=await loadObjectInference('yolov8n',.35),localizer=await loadObjectInference('helmet-head-localizer',.25),classifier=await loadHelmetClassificationInference('helmet');
 const files=[
  'tmp/kollam-live-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-20261007102517107.jpg',
  'tmp/kollam-live-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-20261007102525317.jpg',
  'scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg',
  'scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg',
  'scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg',
  'scratch/helmet-new-false-alert-raw.jpg',
  ...Array.from({length:3},(_,i)=>'scratch/helmet-rajkot-original-'+i+'.jpg'),
 ];
 for(const file of files) {
  try{await access(file);}catch{continue;}
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const persons=(await objects.run(frame)).filter(o=>o.label==='person');
  const full=await localizer.run(frame),refined=[];
  for(const person of persons) {
   const b=person.boundingBox;
   const left=Math.max(0,Math.floor((b.x-b.width*.15)*info.width));
   const top=Math.max(0,Math.floor((b.y-b.height*.15)*info.height));
   const right=Math.min(info.width,Math.ceil((b.x+b.width*1.15)*info.width));
   const bottom=Math.min(info.height,Math.ceil((b.y+b.height*.4)*info.height));
   if(right-left<24||bottom-top<24)continue;
   const crop=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}})
    .extract({left,top,width:right-left,height:bottom-top}).raw().toBuffer();
   const results=await localizer.run({...frame,imageData:crop,width:right-left,height:bottom-top});
   refined.push(...results.map(o=>({...o,boundingBox:{x:(left+o.boundingBox.x*(right-left))/info.width,
    y:(top+o.boundingBox.y*(bottom-top))/info.height,width:o.boundingBox.width*(right-left)/info.width,
    height:o.boundingBox.height*(bottom-top)/info.height}})));
  }
  const scores=[];
  for(const head of [...full,...refined]) {
   const b=head.boundingBox;
   const crops=[0,.15,.75].map(p=>{const x=Math.max(0,b.x-b.width*p),y=Math.max(0,b.y-b.height*p);
    return {x,y,width:Math.min(1,b.x+b.width*(1+p))-x,height:Math.min(1,b.y+b.height*(1+p))-y};});
   scores.push({head,wearingHelmetConfidence:await Promise.all(crops.map(async c=>(await classifier.run(frame,c)).wearingHelmetConfidence))});
  }
  const row={file,persons,full,refined,scores};rows.push(row);console.log(JSON.stringify(row));
 }
 await writeFile('reports/kollam-localization-study-2026-10-07.json',JSON.stringify(rows,null,2));
}finally{await manager.shutdown();}
process.exit(0);
