import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const rows=[];
try {
 const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 const files=[...['1791291164726','1791291349745','1791291808938'].map(id=>({file:`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`,positive:false})),
  ...Array.from({length:3},(_,i)=>({file:`scratch/helmet-rajkot-original-${i}.jpg`,positive:false})),
  ...['scratch/helmet-new-false-alert-raw.jpg','scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg','scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg'].map(file=>({file,positive:false})),
  ...['scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg'].map(file=>({file,positive:true}))];
 for(const {file,positive} of files){
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated-local-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const detections=await objects.run(frame),verifier=new LocalizedHelmetHeadVerifier(localizer,classifier);
  const verification=await Promise.all(detections.filter(o=>o.label==='person').map(async person=>({person,verified:await verifier.verify(frame,person.boundingBox,.9167)})));
  for(const fast of [false,true]){
   const detector=new HelmetDetector(null,.88,classifier,fast,verifier);await detector.initialize();
   const counts=[];
   for(const seconds of [0,0,2,4])counts.push((await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}})).length);
   const passed=positive ? counts[0]===0 && counts[1]===0 && counts[3]>0 : counts.every(n=>n===0) && verification.every(v=>v.verified===null);
   const row={file,positive,fast,counts,verification,passed};rows.push(row);console.log(JSON.stringify({file,positive,fast,counts,passed}));await detector.cleanup();
  }
 }
 await writeFile('reports/helmet-rajkot-fix-validation-2026-10-06.json',JSON.stringify(rows,null,2));
}finally{await manager.shutdown();}
console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length}));process.exit(rows.every(r=>r.passed)?0:1);
