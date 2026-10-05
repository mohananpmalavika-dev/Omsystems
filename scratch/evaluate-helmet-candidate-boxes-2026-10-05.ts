import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {YoloDetectionInference} from '../analytics-engine/src/inference/yolo-detection-inference.js';
import {loadHelmetClassificationInference,loadObjectInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {cropRgb24} from '../analytics-engine/src/inference/vision-specialty-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const session=await InferenceSession.create('tmp/helmet-localizer-candidates/traffic-stage2.onnx',{executionProviders:['cpu'],intraOpNumThreads:2});
const inference=new YoloDetectionInference(session,{labels:['helmet','bare-head','plate'],decoder:'xyxy',inputWidth:320,inputHeight:320,confidenceThreshold:.1});
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const classifier=await loadHelmetClassificationInference('helmet');const objects=await loadObjectInference('yolov8n',.35);
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const files=[...previous.map(row=>row.file),'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',...['1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)];
const results=[];
for(const file of files) {
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 let observations=await objects.run(frame);
 if(file.includes('179120459'))observations=[{label:'person',confidence:.90,boundingBox:{x:.1885221976557822,y:.31599211051675247,width:.3292088765249364,height:.6652398645216123}}];
 if(file.includes('179120456')||file.includes('179120437'))observations=[{label:'person',confidence:.90,boundingBox:{x:.4102723228667016,y:.023265866745033465,width:.19990818377427783,height:.49235594252071696}}];
 const detector=new HelmetDetector(null,.88,classifier,true);await detector.initialize();
 const detected=await detector.detect({...frame,metadata:{inferenceMode:'local-onnx',detections:observations}});
 for(const alert of detected)for(const helmet of alert.objects.filter(d=>d.label==='helmet'))for(const padding of [.3,.6,1]) {
  const b=helmet.boundingBox,x=Math.max(0,b.x-b.width*padding),y=Math.max(0,b.y-b.height*padding);
  const box={x,y,width:Math.min(1-x,b.width*(1+2*padding)),height:Math.min(1-y,b.height*(1+2*padding))};
  const crop=cropRgb24(frame,box);
  const resized=await sharp(crop.imageData,{raw:{width:crop.width,height:crop.height,channels:3}}).resize(320,320,{fit:'contain',background:{r:114,g:114,b:114}}).raw().toBuffer();
  const detections=await inference.run({...frame,imageData:resized,width:320,height:320});
  const row={file,helmet,padding,box,detections};results.push(row);console.log(JSON.stringify(row));
 }
 await detector.cleanup();
}
await writeFile('reports/helmet-candidate-box-evaluation-2026-10-05.json',JSON.stringify(results,null,2));
await session.release();await manager.shutdown();process.exit(0);
