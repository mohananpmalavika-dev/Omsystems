import readline from 'node:readline';
import sharp from 'sharp';
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference,loadPoseInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
const lines=readline.createInterface({input:process.stdin});
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 let face=null,pose=null;
 try{face=await loadObjectInference('face-detector',.6);}catch{}
 try{pose=await loadPoseInference('pose-estimator',.4);}catch{}
 const verifier=new LocalizedHelmetHeadVerifier(localizer,classifier,face,pose);
 const detector=new HelmetDetector(null,.88,classifier,process.env.HELMET_FAST_ALERT==='true',verifier);await detector.initialize();
 let sample=0;
 for await(const line of lines){
  if(!line.trim())continue;
  const cached=JSON.parse(line),image=Buffer.from(cached.imageBase64,'base64');
  if(image.length!==640*360*3)throw new Error('Unexpected RGB24 frame dimensions');
  const frame={cameraId:'isolated-pilot-sequence',tenantId:'isolated',timestamp:new Date(cached.capturedAt),imageData:image,width:640,height:360};
  const detections=await objects.run(frame),heads=await localizer.run(frame);
  const verification=[];
  for(const person of detections.filter(o=>o.label==='person'))verification.push({person,verified:await verifier.verify(frame,person.boundingBox,.9167)});
  const results=await detector.detect({...frame,metadata:{inferenceMode:'local-onnx',detections}});
  const snapshotBase64=(await sharp(image,{raw:{width:640,height:360,channels:3}}).jpeg().toBuffer()).toString('base64');
  console.log('DIAG_JSON '+JSON.stringify({sample:++sample,checkedAt:new Date().toISOString(),capturedAt:cached.capturedAt,
   fastAlert:process.env.HELMET_FAST_ALERT==='true',detections,heads,verification,results,eventsSubmitted:0,snapshotBase64}));
 }
 await detector.cleanup();
}finally{await manager.shutdown();}
process.exit(0);
