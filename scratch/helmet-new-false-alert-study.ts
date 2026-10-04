import sharp from 'sharp';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getModelManager } from '../analytics-engine/src/model-manager.js';
import { loadObjectInference, loadHelmetClassificationInference } from '../analytics-engine/src/inference/configured-model-inference.js';
import { HelmetDetector } from '../analytics-engine/src/detectors/helmet-detector.js';
const manager = getModelManager({modelsDirectory:path.resolve('analytics-engine/models'),enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
  const objects = await loadObjectInference('yolov8n', .35);
  const classifier = await loadHelmetClassificationInference('helmet');
  const output = [];
  for (const file of ['C:/Users/Dhanya/Downloads/incident-snapshot-1791111334054.jpg','scratch/helmet-new-false-alert-raw.jpg','scratch/helmet-alert-ch6.jpg','tmp/helmet-channel-6.jpg']) {
    const {data,info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const frame={cameraId:file,tenantId:'isolated-replay',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
    const detected=await objects.run(frame); const persons=detected.filter(o=>o.label==='person');const crops=[];
    for (const person of persons) { const b=person.boundingBox;
      for (const [h,w] of [[.55,1],[.35,1],[.15,1],[.15,.8],[.20,1],[.25,1],[.3,1],[.2,.8]]) {
        const box={x:b.x+b.width*(1-w)/2,y:b.y,width:b.width*w,height:b.height*h};
        crops.push({person, h,w,...await classifier.run(frame,box)});
      }
    }
    const detector = new HelmetDetector(null,.88,classifier); await detector.initialize(); const results=[];
    for (const seconds of [0,2,4]) results.push(await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections:detected}}));
    const isBareHead=file.includes('incident-snapshot') || file.includes('false-alert-raw');
    console.log(JSON.stringify({file,persons,crops,alerts:results.map(r=>r.length)}));
    await detector.cleanup(); output.push({file,persons,crops,results}); console.log(JSON.stringify({file,alerts:results.map(r=>r.length),personConfidence:persons.map(p=>p.confidence)}));
  }
  await writeFile('reports/helmet-new-false-alert-study-2026-10-04.json',JSON.stringify(output,null,2));
} finally { await manager.shutdown(); }
process.exit(0);
