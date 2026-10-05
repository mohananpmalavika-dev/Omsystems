import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35), classifier=await loadHelmetClassificationInference('helmet'), localizer=await loadObjectInference('helmet-head-localizer',.25);
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const rows=previous.map((row,index)=>({file:row.file,expected:index>=20,raised:index===20}));
for(const file of ['scratch/helmet-false-f5781a86-8527-4a30-a94a-3f256555fbcb.jpg','scratch/helmet-false-f0b4f55e-00c0-442c-a0e1-3d6a05150bdf.jpg','scratch/helmet-new-false-alert-raw.jpg',...['1791040935773','1791040925724','1791040917135','1791040909261','1791006290219','1791202017341','1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)])rows.push({file,expected:false,raised:false});
const results=[];
for(const row of rows) {
 const {data,info}=await sharp(row.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:row.file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const detections=await objects.run(frame);
 for(const fastAlert of [false,true]) {
  const detector=new HelmetDetector(null,.88,classifier,fastAlert,new LocalizedHelmetHeadVerifier(localizer,classifier));await detector.initialize();
  const counts=[];
  for(const seconds of [0,0,2,4])counts.push((await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}})).length);
  const expected=row.expected?(fastAlert?[1,1,1,1]:row.raised?[0,0,0,1]:[0,0,1,1]):[0,0,0,0];
  const result={file:row.file,fastAlert,counts,expected,passed:JSON.stringify(counts)===JSON.stringify(expected)};results.push(result);console.log(JSON.stringify(result));await detector.cleanup();
 }
}
await writeFile('reports/helmet-head-verification-replay-2026-10-05.json',JSON.stringify(results,null,2));await manager.shutdown();process.exit(results.every(row=>row.passed)?0:1);
