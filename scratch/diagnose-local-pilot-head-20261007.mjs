import sharp from 'sharp';
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference,loadPoseInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const cached=JSON.parse(input);
if(!cached.imageBase64)throw new Error('No current Local Camera Pilot Channel 8 frame');
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
try {
 const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 let faces=null,poses=null;
 try{faces=await loadObjectInference('face-detector',.6);}catch{}
 try{poses=await loadPoseInference('pose-estimator',.4);}catch{}
 const image=Buffer.from(cached.imageBase64,'base64');
 const rawRgb=image.length===640*360*3;
 const decoded=rawRgb?{data:image,info:{width:640,height:360}}:await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const {data,info}=decoded;
 const snapshotBase64=(await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).jpeg().toBuffer()).toString('base64');
 const frame={cameraId:'isolated-'+cached.cameraId,tenantId:'isolated',timestamp:new Date(cached.capturedAt),imageData:data,width:info.width,height:info.height};
 const detections=await objects.run(frame),heads=await localizer.run(frame);
 const calls=[];
 const traced={run:async(f,box)=>{const result=await classifier.run(f,box);calls.push({box,result});return result;}};
 const verifier=new LocalizedHelmetHeadVerifier(localizer,traced,faces,poses);
 const verification=[];
 for(const person of detections.filter(o=>o.label==='person')){
  const begin=calls.length;
  verification.push({person,verified:await verifier.verify(frame,person.boundingBox,.9167),classificationCalls:calls.slice(begin)});
 }
 const detector=new HelmetDetector(null,.88,traced,process.env.HELMET_FAST_ALERT==='true',verifier);await detector.initialize();
 const begin=calls.length;
 const results=await detector.detect({...frame,metadata:{inferenceMode:'local-onnx',detections}});
 console.log('DIAG_JSON '+JSON.stringify({checkedAt:new Date().toISOString(),cameraId:cached.cameraId,
 capturedAt:cached.capturedAt,frameAgeSeconds:(Date.now()-Date.parse(cached.capturedAt))/1000,width:info.width,height:info.height,
 auxiliaryModels:{face:!!faces,pose:!!poses},fastAlert:process.env.HELMET_FAST_ALERT==='true',detections,heads,
 faces:faces?await faces.run(frame):[],poses:poses?await poses.run(frame):[],verification,
 singleFrameResults:results,detectorClassificationCalls:calls.slice(begin),eventsSubmitted:0,snapshotBase64}));
 await detector.cleanup();
}finally{await manager.shutdown();}
process.exit(0);
