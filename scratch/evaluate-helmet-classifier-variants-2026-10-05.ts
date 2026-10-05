import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {loadObjectInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {HelmetClassificationInference} from '../analytics-engine/src/inference/vision-specialty-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35);
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const files=[...previous.map(row=>row.file),'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',...['1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)];
const results=[];
for(const variant of ['v5','v5b','v5c']) {
 const session=await InferenceSession.create(`tmp/helmet-localizer-candidates/helmet_${variant}.onnx`,{executionProviders:['cpu'],intraOpNumThreads:2});
 const classifier=new HelmetClassificationInference(session,224,224,'imagenet-stretch',true);
 for(const file of files) {
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  let observations=await objects.run(frame);
  if(file.includes('179120459'))observations=[{label:'person',confidence:.90,boundingBox:{x:.1885221976557822,y:.31599211051675247,width:.3292088765249364,height:.6652398645216123}}];
  if(file.includes('179120456')||file.includes('179120437'))observations=[{label:'person',confidence:.90,boundingBox:{x:.4102723228667016,y:.023265866745033465,width:.19990818377427783,height:.49235594252071696}}];
  const detector=new HelmetDetector(null,.88,classifier,true);await detector.initialize();
  const detected=await detector.detect({...frame,metadata:{inferenceMode:'local-onnx',detections:observations}});
  const row={file,variant,detected};results.push(row);console.log(JSON.stringify(row));await detector.cleanup();
 }
 await session.release();
}
await writeFile('reports/helmet-classifier-variant-evaluation-2026-10-05.json',JSON.stringify(results,null,2));
await manager.shutdown();process.exit(0);
