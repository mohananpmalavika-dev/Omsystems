import assert from 'node:assert/strict';
import sharp from 'sharp';import path from 'node:path';import {writeFile} from 'node:fs/promises';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});await manager.initialize();
try{const objects=await loadObjectInference('yolov8n',.35);const classifier=await loadHelmetClassificationInference('helmet');const detector=new HelmetDetector(null,.88,classifier);await detector.initialize();const evidence=[];
for(const [file,expected] of [['scratch/helmet-alert-ch6.jpg',true],['scratch/helmet-alert-ch2.jpg',false],['scratch/helmet-alert-ch8.jpg',false],['tmp/helmet-channel-6.jpg',true],['tmp/false-helmet-6e8bb747-de8e-4eb2-9159-272e370f0e87.jpg',false],['tmp/false-helmet-b5642331-f399-4a7a-a091-26eb293eeef9.jpg',false]] as const){
const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});const f={cameraId:file,tenantId:'local-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};const detections=await objects.run(f);const events=[];
for(const seconds of [0,0,2,4]){const r=await detector.detect({...f,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}});assert.equal(r.length>0,seconds>0&&expected,file);events.push({seconds,alerts:r.length,confidence:r[0]?.confidence});}
evidence.push({file,expected,persons:detections.filter(o=>o.label==='person').map(o=>o.confidence),events});}
await writeFile('reports/helmet-compact-replay-2026-10-04.json',JSON.stringify({version:'1.1.3',mode:'static replay; no events submitted',evidence},null,2));console.log(JSON.stringify(evidence));await detector.cleanup();}finally{await manager.shutdown();}process.exit(0);
