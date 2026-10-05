import {createRequire} from 'node:module';
const sharp = createRequire('/app/dist/analytics-engine/src/analytics-pipeline.js')('sharp');
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
const directory = process.argv[2] || '/validation';
const samples = [
  ['false-131901.jpg', false], ['false-124130.jpg', false],
  ['previous-bare-head.jpg', false],
  ['wearer-raised.jpg', true], ['wearer-compact.jpg', true], ['wearer-standard.jpg', true],
  ...[1,2,3,4,5].map(n=>[`previous-false-${n}.jpg`,false]),
];
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
try {
  const objects=await loadObjectInference('yolov8n',.35);
  const classifier=await loadHelmetClassificationInference('helmet');
  const output=[];
  for(const [file,expected] of samples){
    const {data,info}=await sharp(`${directory}/${file}`).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const frame={cameraId:file,tenantId:'isolated-validation',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
    const detections=await objects.run(frame);
    for(const fastAlert of [false,true]){
      const detector=new HelmetDetector(null,.88,classifier,fastAlert);await detector.initialize();
      const counts=[];
      for(const seconds of [0,0,2,4])counts.push((await detector.detect({...frame,timestamp:new Date(seconds*1000),metadata:{inferenceMode:'local-onnx',detections}})).length);
      const expectedCounts=expected?(fastAlert?[1,1,1,1]:(file==='wearer-raised.jpg'?[0,0,0,1]:[0,0,1,1])):[0,0,0,0];
      assert.deepEqual(counts,expectedCounts,`${file} fast=${fastAlert}`);
      output.push({file,fastAlert,counts,expectedCounts});
      console.log('VALIDATED',JSON.stringify(output.at(-1)));
      await detector.cleanup();
    }
  }
  await writeFile('/tmp/helmet-false-alarms-2026-10-05-validation.json',JSON.stringify({version:'1.1.7',mode:'isolated replay; no events submitted',samples:output},null,2));
}finally{await manager.shutdown();}
process.exit(0);
