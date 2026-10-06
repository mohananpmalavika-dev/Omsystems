import readline from 'node:readline';
import sharp from 'sharp';
import {AnalyticsPipeline} from '/app/dist/analytics-engine/src/analytics-pipeline.js';
import {loadObjectInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
const lines=readline.createInterface({input:process.stdin});
const incoming=lines[Symbol.asyncIterator]();
const pipeline=new AnalyticsPipeline();await pipeline.initialize();
const directObjects=await loadObjectInference('yolov8n',.35);
let trace={};
for(const [key,name] of [['objectDetector','objects'],['personDetector','persons'],['helmetDetector','helmets']]){
 const detector=pipeline[key],detect=detector.detect.bind(detector);
 detector.detect=async(frame)=>{const results=await detect(frame);trace[name]=results;return results;};
}
try{
 for await(const line of incoming){
  if(!line.trim())continue;
  const sample=JSON.parse(line),data=Buffer.from(sample.imageBase64,'base64');
  if(data.length!==640*360*3)throw new Error('Unexpected RGB24 dimensions');
  const frame={cameraId:'isolated-pilot-pipeline-'+sample.cameraId,tenantId:'isolated',timestamp:new Date(sample.capturedAt),imageData:data,width:640,height:360,
   metadata:{source:'isolated-readonly-diagnostic'}};
  trace={};let personCount;
  const events=await pipeline.processFrame(frame,sample.rules,observation=>{personCount=observation;});
  const direct=await directObjects.run(frame),verification=[];
  for(const person of direct.filter(o=>o.label==='person'))verification.push({person,verified:await pipeline.helmetDetector.headVerifier.verify(frame,person.boundingBox,.9167)});
  const snapshotBase64=(await sharp(data,{raw:{width:640,height:360,channels:3}}).jpeg().toBuffer()).toString('base64');
  console.log('PIPELINE_JSON '+JSON.stringify({checkedAt:new Date().toISOString(),cameraId:sample.cameraId,capturedAt:sample.capturedAt,
   personCount,trace,direct,verification,snapshotBase64,events:events.map(event=>({detectionType:event.detectionType,confidence:event.confidence,modelVersion:event.modelVersion})),
   pending:pipeline.helmetDetector.pendingHeads.get(frame.cameraId)??[],eventsSubmitted:0}));
 }
}finally{await pipeline.cleanup();}
process.exit(0);
