import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sharp = createRequire('/app/dist/analytics-engine/src/analytics-pipeline.js')('sharp');
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
const originals = process.argv.includes('--originals');
const study = process.argv.includes('--study');
const samples = originals
  ? JSON.parse(await readFile('/dev/stdin', 'utf8')).map(row => ({...row, image: Buffer.from(row.snapshot, 'base64'), expected: false}))
  : JSON.parse(await readFile('/validation/samples.json', 'utf8')).map(row => ({...row, image: '/validation/' + row.file}));
assert.ok(samples.length > 0, 'No replay fixtures found');
const manager = getModelManager({modelsDirectory:'/app/models', enableGPU:false, startCleanupTimer:false});
await manager.initialize();
let failures = 0;
try {
  const objects = await loadObjectInference('yolov8n', .35);
  const classifier = await loadHelmetClassificationInference('helmet');
  const headLocalizer = await loadObjectInference('helmet-head-localizer', .25);
  for (const sample of samples) {
    const {data, info} = await sharp(sample.image).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const frame = {cameraId: sample.id ?? sample.file, tenantId:'isolated-validation', timestamp:new Date(0), imageData:data, width:info.width, height:info.height};
    const detections = sample.observations?.length ? sample.observations : await objects.run(frame);
    if (study) {
      for (const person of detections.filter(d => d.label === 'person' && d.confidence >= .8)) {
        const b=person.boundingBox, scores=[];
        for(const offset of [-.2,-.15,-.1,-.05,0]) for(const h of [.15,.2,.25,.3,.35]) for(const w of [.4,.6,.8,1,1.2]) {
          const y=Math.max(0,b.y+b.height*offset),x=Math.max(0,b.x+b.width*(1-w)/2);
          scores.push([offset,h,w,(await classifier.run(frame,{x,y,width:Math.min(1-x,b.width*w),height:Math.min(1-y,b.height*h)})).wearingHelmetConfidence]);
        }
        console.log('STUDY',JSON.stringify({id:sample.id??sample.file,person,scores}));
      }
      continue;
    }
    for (const fastAlert of [false, true]) {
      const detector = new HelmetDetector(null, .88, null, fastAlert);
      await detector.initialize();
      assert.equal(detector.getHealth().status, 'healthy', 'Default production detector did not load verified models');
      const counts = [];
      for (const seconds of [0,0,2,4]) counts.push((await detector.detect({...frame, timestamp:new Date(seconds*1000), metadata:{inferenceMode:'local-onnx',detections}})).length);
      const expected = sample.expected ? (fastAlert ? [1,1,1,1] : sample.raised ? [0,0,0,1] : [0,0,1,1]) : [0,0,0,0];
      const passed = JSON.stringify(counts) === JSON.stringify(expected);
      if (!passed) failures++;
      console.log(passed ? 'VALIDATED' : 'FAILED', JSON.stringify({id: sample.id ?? sample.file, fastAlert, counts, expected}));
      if (!passed) {
        for (const person of detections.filter(d => d.label === 'person')) {
          const b = person.boundingBox;
          const scores = [];
          for (const [offset,h,w] of [[-.15,.55,1.3],[0,.35,.8],[0,.25,.4],[0,.15,1],[0,.15,.8],[-.15,.25,1],[-.15,.25,.8],[0,.25,.6],[-.15,.15,.8],[-.15,.3,.6]]) {
            const y = Math.max(0,b.y+b.height*offset), x = Math.max(0,b.x+b.width*(1-w)/2);
            scores.push({offset,h,w,score:(await classifier.run(frame,{x,y,width:Math.min(1-x,b.width*w),height:Math.min(1-y,b.height*h)})).wearingHelmetConfidence});
          }
          console.log('SCORES', JSON.stringify({id:sample.id ?? sample.file, person, scores}));
        }
      }
      await detector.cleanup();
    }
  }
} finally {await manager.shutdown();}
console.log('SUMMARY',JSON.stringify({version:process.env.DETECTOR_VERSION??'1.1.8',samples:samples.length,checks:samples.length*2,failures,originals,eventsSubmitted:0}));
process.exit(failures ? 1 : 0);
