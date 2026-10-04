set -e
sudo docker exec -i sentinel-gcp-control-plane node <<'CP'
const fs=require('node:fs');
const {createClient}=require('redis');
(async()=>{const client=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:false}});client.on('error',()=>{});await client.connect();const out=[];
for(const [channel,id] of [[2,'5a114643-b80e-4872-8067-376fed66e8bd'],[6,'0494e750-b4b2-49a6-9dbc-9d97a086df1f'],[8,'af9e87de-714a-4175-8162-096e89cffc13']]){const v=await client.get('analytics:latest-frame:'+id);out.push({channel,id,cached:v?JSON.parse(v):null});}
fs.writeFileSync('/tmp/helmet-alert-replay-frames.json',JSON.stringify(out));await client.quit();})().catch(e=>{console.error(e.message);process.exit(1)});
CP
sudo docker cp sentinel-gcp-control-plane:/tmp/helmet-alert-replay-frames.json /tmp/helmet-alert-replay-frames.json
sudo docker cp /tmp/helmet-alert-replay-frames.json sentinel-gcp-analytics-engine:/tmp/helmet-alert-replay-frames.json
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
import sharp from 'sharp';
import {getModelManager} from './dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from './dist/analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from './dist/analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35);
 const classifier=await loadHelmetClassificationInference('helmet');
 const detector=new HelmetDetector(null,.88,classifier);await detector.initialize();
 for (const {channel,id,cached} of JSON.parse(fs.readFileSync('/tmp/helmet-alert-replay-frames.json','utf8'))) {
  if(!cached){console.log('REPLAY',JSON.stringify({channel,cached:false}));continue;}
  const data=Buffer.from(cached.imageBase64,'base64');const info={width:640,height:data.length/(640*3)};
  if(!Number.isInteger(info.height))throw new Error('Unexpected RGB frame dimensions');
  const jpeg=await sharp(data,{raw:{...info,channels:3}}).jpeg().toBuffer();
  const frame={cameraId:id,tenantId:'diagnostic-replay',timestamp:new Date(cached.capturedAt),imageData:data,width:info.width,height:info.height};
  const detections=await objects.run(frame);const persons=detections.filter(o=>o.label==='person');const scores=[];
  for(const person of persons){const b=person.boundingBox;
   const upper={x:Math.max(0,b.x-b.width*.15),y:Math.max(0,b.y-b.height*.15),width:Math.min(1-Math.max(0,b.x-b.width*.15),b.width*1.3),height:Math.min(1-Math.max(0,b.y-b.height*.15),b.height*.55)};
   const head={x:b.x+b.width*.1,y:b.y,width:b.width*.8,height:b.height*.35};
   scores.push({person,upper:await classifier.run(frame,upper),head:await classifier.run(frame,head)});
  }
  const events=[];for(const offset of [0,2000,4000])events.push(await detector.detect({...frame,timestamp:new Date(frame.timestamp.getTime()+offset),metadata:{inferenceMode:'local-onnx',detections}}));
  await sharp(jpeg).toFile('/tmp/helmet-alert-ch'+channel+'.jpg');
  console.log('REPLAY',JSON.stringify({channel,capturedAt:cached.capturedAt,ageSeconds:(Date.now()-Date.parse(cached.capturedAt))/1000,width:info.width,height:info.height,scores,alerts:events.map(e=>e.map(r=>({type:r.detectionType,confidence:r.confidence})))}));
 }
 await detector.cleanup();
}finally{await manager.shutdown();}
process.exit(0);
JS
