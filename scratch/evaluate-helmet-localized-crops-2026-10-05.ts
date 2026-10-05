import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {YoloDetectionInference} from '../analytics-engine/src/inference/yolo-detection-inference.js';
import {loadObjectInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {cropRgb24} from '../analytics-engine/src/inference/vision-specialty-inference.js';
const v2=process.argv.includes('--v2');
const session=await InferenceSession.create(`tmp/helmet-localizer-candidates/${v2?'v2-best':'traffic-stage2'}.onnx`,{executionProviders:['cpu'],intraOpNumThreads:2});
const inference=new YoloDetectionInference(session,{labels:v2?['helmet','bare-head']:['helmet','bare-head','plate'],decoder:v2?'yolov5':'xyxy',inputWidth:320,inputHeight:320,confidenceThreshold:.1});
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35);
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const files=[...previous.map(row=>row.file),'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',...['1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)];
const results=[];
for(const file of files) {
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const people=(await objects.run(frame)).filter(d=>d.label==='person' && d.confidence>=.65);
 for(const person of people) {
  const b=person.boundingBox;
  for(const height of [1.15,.55]) {
   const x=Math.max(0,b.x-.15*b.width),y=Math.max(0,b.y-.15*b.height);
   const box={x,y,width:Math.min(1-x,1.3*b.width),height:Math.min(1-y,height*b.height)};
   const crop=cropRgb24(frame,box);
   const resized=await sharp(crop.imageData,{raw:{width:crop.width,height:crop.height,channels:3}}).resize(320,320,{fit:'contain',background:{r:114,g:114,b:114}}).raw().toBuffer();
   const detections=await inference.run({...frame,imageData:resized,width:320,height:320});
   const row={file,person,box,detections};results.push(row);console.log(JSON.stringify(row));
  }
 }
}
await writeFile(`reports/helmet-localized-${v2?'v2-':''}crop-evaluation-2026-10-05.json`,JSON.stringify(results,null,2));
await session.release();await manager.shutdown();process.exit(0);
