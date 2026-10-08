import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const positive=JSON.parse(await readFile('reports/kollam-channel4-walking-raw-validation-2026-10-07.json','utf8')).samples;
const ch8=JSON.parse(await readFile('reports/kollam-raw-pass-20261007112236917.json','utf8')).samples;
const negatives=JSON.parse(await readFile('reports/helmet-semantic-benchmark-inputs-2026-10-07.json','utf8'))
 .filter(item=>!item.expectedHelmet);
negatives.push({file:'tmp/helmet-negative-paddle.png',group:'hat-control'});
negatives.push({file:'scratch/bettiah-entry-20261008/ch2/frame-015.jpg',group:'carried-helmet-control'});
for(let i=1;i<=33;i++)negatives.push({file:'scratch/bettiah-entry-20261008/ch5/frame-'+String(i).padStart(3,'0')+'.jpg',group:'bettiah-pre-entry-unhelmeted'});
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
const results=[];
const old=await loadHelmetClassificationInference('helmet');
const head=await loadHelmetClassificationInference('helmet-head-evidence');
const localizer=await loadObjectInference('helmet-head-localizer',.25);
const objects=await loadObjectInference('yolov8n',.35);
const verifier=new LocalizedHelmetHeadVerifier(localizer,old,null,null,head);
const detector=new HelmetDetector(null,.75,old,true,verifier);await detector.initialize();
try{
 for(const [group,samples] of [['ch4-helmet-walking',positive],['ch8-helmet-walking-user-confirmed',ch8]] as const){
  for(const sample of samples){
   const file=sample.rawFile??sample.file;let data=await readFile(file); data=await sharp(await sharp(data,{raw:{width:640,height:360,channels:3}}).jpeg({quality:95,chromaSubsampling:"4:4:4"}).toBuffer()).raw().toBuffer();
   if(data.length!==640*360*3)throw new Error('Unexpected raw frame length');
   const frame={cameraId:sample.cameraId,tenantId:'isolated',width:640,height:360,imageData:data,
    timestamp:new Date(sample.capturedAt),metadata:{inferenceMode:'local-onnx',detections:[] as any[]}};
   frame.metadata.detections=await objects.run(frame);
   const persons=frame.metadata.detections.filter(p=>p.label==='person');
   const verified=[];
   for(const person of persons)verified.push({person,head:await verifier.verify(frame,person.boundingBox,.8)});
   const alerts=await detector.detect(frame);
   results.push({file,sha256:createHash('sha256').update(data).digest('hex'),capturedAt:sample.capturedAt,group,
    verified,alerts,eventsSubmitted:0});
   console.log(JSON.stringify({file,group,alerts:alerts.length,verified:verified.map(v=>v.head)}));
  }
 }
 for(const [index,sample] of negatives.entries()) {
  const {data,info}=await sharp(sample.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:sample.group==='bettiah-pre-entry-unhelmeted'?'bettiah-pre-entry':'negative-'+index,tenantId:'isolated',width:info.width,height:info.height,imageData:data,
   timestamp:new Date(index*2000),metadata:{inferenceMode:'local-onnx',detections:[] as any[]}};
  frame.metadata.detections=await objects.run(frame);
  const alerts=await detector.detect(frame);
  results.push({file:sample.file,sha256:createHash('sha256').update(data).digest('hex'),group:'confirmed-negative',alerts,eventsSubmitted:0});
  console.log(JSON.stringify({file:sample.file,group:'confirmed-negative',alerts:alerts.length}));
 }
 await writeFile('reports/bettiah-walking-regression-replay-2026-10-08.json',JSON.stringify({results,
  summary:{ch4Frames:positive.length,ch8Frames:ch8.length,
   ch4AlertFrames:results.filter(r=>r.group==='ch4-helmet-walking'&&r.alerts.length).length,
   ch8AlertFrames:results.filter(r=>r.group==='ch8-helmet-walking-user-confirmed'&&r.alerts.length).length,
   negativeFrames:negatives.length,negativeAlertFrames:results.filter(r=>r.group==='confirmed-negative'&&r.alerts.length).length,
   labels:'CH8 wearer confirmed by user; absence/clipping is an abstention, not a bare-head negative'}},null,2));
 const failure=results.some(r=>r.group==='confirmed-negative'&&r.alerts.length);
 if(failure)throw new Error('Candidate failed confirmed negative replay');
}finally{await detector.cleanup();await manager.shutdown();}
process.exit(0);
