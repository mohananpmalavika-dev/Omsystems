import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
process.env.HELMET_HEAD_EVIDENCE_CAMERAS='*';
process.env.HELMET_CONFIDENCE_THRESHOLD='0.75';
process.env.OBJECT_CONFIDENCE_THRESHOLD='0.35';
process.env.HELMET_FAST_ALERT='true';
const detectorFile='analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js';
const detectorSource=fs.readFileSync(detectorFile,'utf8');
const production=JSON.parse(fs.readFileSync('reports/bettiah-entry-production-runtime-2026-10-08.json','utf8'));
for(const [file,expected] of Object.entries(production.hashes)){
 const actual=createHash('sha256').update(fs.readFileSync('analytics-engine/dist/analytics-engine/src/'+file)).digest('hex');
 if(actual!==expected)throw Error('Local compiled runtime differs from deployed '+file);
}
const {openHelmetReplay}=await import('../analytics-engine/scripts/helmet-replay.mjs');
const {LocalizedHelmetHeadVerifier}=await import('../analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js');
let trace=[];
const verify=LocalizedHelmetHeadVerifier.prototype.verify;
LocalizedHelmetHeadVerifier.prototype.verify=async function(frame,person,threshold){
 const checks=[];
 const oldRun=this.headClassifier?.run.bind(this.headClassifier);
 if(oldRun)this.headClassifier.run=async(f,box)=>{const result=await oldRun(f,box);checks.push({box,sourceWidth:box.width*f.width,sourceHeight:box.height*f.height,...result});return result;};
 try{const result=await verify.call(this,frame,person,threshold);trace.push({person,threshold,result,checks});return result;}
 finally{if(oldRun)this.headClassifier.run=oldRun;}
};
const replay=await openHelmetReplay();
const rows=[];
try{
 console.log('HEALTH '+JSON.stringify(replay.health()));
 for(const [width,height] of [[640,360],[960,540]]){
  await replay.reset();
  for(let index=33;index<=44;index++){
   const file='scratch/bettiah-entry-20261008/ch5/frame-'+String(index).padStart(3,'0')+'.jpg';
   const image=await sharp(file).resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer();
   const timestamp=new Date(Date.parse('2026-10-08T04:37:03Z')+(index-1)*2000);
   trace=[];
   const result=await replay.run({cameraId:'offline-bettiah-ch5',tenantId:'offline',timestamp,width,height,imageData:image,metadata:{inferenceMode:'local-onnx'}});
   const row={file,...result,verification:trace,eventsSubmitted:0};rows.push(row);
   console.log(JSON.stringify({file,width,persons:row.persons.map(p=>({confidence:p.confidence,heightPixels:p.boundingBox.height*height,box:p.boundingBox})),results:row.results.length,verification:trace}));
  }
 }
 fs.writeFileSync('reports/bettiah-entry-helmet-replay-2026-10-08.json',JSON.stringify({checkedAt:new Date().toISOString(),detectorSha256:createHash('sha256').update(detectorSource).digest('hex'),timestamps:'Nominal video PTS; frame35 DVR overlay is 10:08:11 IST',config:replay.config,rows,eventsSubmitted:0},null,2));
}finally{await replay.close();}

