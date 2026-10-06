import sharp from 'sharp';
import {access,readFile,writeFile} from 'node:fs/promises';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';

const previous = JSON.parse(await readFile('reports/helmet-head-verification-replay-2026-10-05.json','utf8'));
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35);
const classifier=await loadHelmetClassificationInference('helmet');
const localizer=await loadObjectInference('helmet-head-localizer',.25);
const results=[];
for (const row of previous) {
  try { await access(row.file); } catch {
    results.push({file:row.file,fastAlert:row.fastAlert,skipped:true});
    continue;
  }
  const {data,info}=await sharp(row.file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:row.file,tenantId:'isolated-local-replay',timestamp:new Date(0),
    imageData:data,width:info.width,height:info.height};
  const detections=await objects.run(frame);
  const heads=await localizer.run(frame);
  const verifier=new LocalizedHelmetHeadVerifier(localizer,classifier);
  const persons=detections.filter(object=>object.label==='person');
  const verification=await Promise.all(persons.map(async person=>({person,
    verified:await verifier.verify(frame,person.boundingBox,.9167)})));
  const detector=new HelmetDetector(null,.88,classifier,row.fastAlert,
    verifier);
  await detector.initialize();
  const counts=[];
  for (const seconds of [0,0,2,4]) {
    counts.push((await detector.detect({...frame,timestamp:new Date(seconds*1000),
      metadata:{inferenceMode:'local-onnx',detections}})).length);
  }
  const positive=row.expected.some((count:number)=>count>0);
  const passed=positive ? counts[3]>0 && counts[0]===counts[1] : counts.every(count=>count===0);
  const result={file:row.file,fastAlert:row.fastAlert,counts,previousCounts:row.counts,positive,passed,heads,verification};
  results.push(result); console.log(JSON.stringify(result));
  await detector.cleanup();
}
await writeFile('reports/helmet-confirmation-replay-2026-10-06.json',JSON.stringify(results,null,2));
await manager.shutdown();
console.log(JSON.stringify({passed:results.filter(row=>row.passed).length,
  failed:results.filter(row=>row.passed===false).length,skipped:results.filter(row=>row.skipped).length}));
process.exit(results.every(row=>row.passed || row.skipped)?0:1);
