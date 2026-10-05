import sharp from 'sharp';
import {InferenceSession} from 'onnxruntime-node';
import {readFile,writeFile} from 'node:fs/promises';
import {YoloDetectionInference} from '../analytics-engine/src/inference/yolo-detection-inference.js';
import {loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
const session=await InferenceSession.create('tmp/helmet-localizer-candidates/v2-best.onnx',{executionProviders:['cpu'],intraOpNumThreads:2});
const inference=new YoloDetectionInference(session,{labels:['helmet','head'],decoder:'yolov5',inputWidth:320,inputHeight:320,confidenceThreshold:.25});
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const classifier=await loadHelmetClassificationInference('helmet');
const previous=JSON.parse(await readFile('reports/helmet-batch-false-alarms-2026-10-05-study.json','utf8'));
const files=[...previous.map(row=>row.file),'C:/Users/Dhanya/Downloads/incident-snapshot-1791202017341.jpg',...['1791204590121','1791204562457','1791204377566'].map(id=>`C:/Users/Dhanya/Downloads/incident-snapshot-${id}.jpg`)];
const results=[];
for(const file of files) {
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:file,tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
 const resized=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).resize(320,320,{fit:'contain',background:{r:114,g:114,b:114}}).raw().toBuffer();
 const detected=await inference.run({...frame,imageData:resized,width:320,height:320});
 const scale=Math.min(320/info.width,320/info.height),left=(320-Math.round(info.width*scale))/2,top=(320-Math.round(info.height*scale))/2;
 for(const head of detected) {
  const b=head.boundingBox,x=Math.max(0,(b.x*320-left)/scale/info.width),y=Math.max(0,(b.y*320-top)/scale/info.height);
  const right=Math.min(1,((b.x+b.width)*320-left)/scale/info.width),bottom=Math.min(1,((b.y+b.height)*320-top)/scale/info.height);
  const box={x,y,width:right-x,height:bottom-y};
  const scores=[];
  for(const padding of [0,.15,.3]) {
   const cx=Math.max(0,x-box.width*padding),cy=Math.max(0,y-box.height*padding);
   const crop={x:cx,y:cy,width:Math.min(1-cx,box.width*(1+2*padding)),height:Math.min(1-cy,box.height*(1+2*padding))};
   scores.push({padding,...await classifier.run(frame,crop)});
  }
  scores.push({padding:'crown',...await classifier.run(frame,{...box,height:box.height*.65})});
  const row={file,head:{...head,boundingBox:box},scores};results.push(row);console.log(JSON.stringify(row));
 }
}
await writeFile('reports/helmet-localized-head-evaluation-2026-10-05.json',JSON.stringify(results,null,2));
await session.release();await manager.shutdown();process.exit(0);
