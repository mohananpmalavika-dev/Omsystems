import {createRequire} from 'node:module';
const sharp=createRequire('/app/dist/analytics-engine/src/inference/helmet-head-classification.js')('sharp');
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import {HELMET_HEAD_PROBE_SHA256} from '/app/dist/analytics-engine/src/inference/helmet-head-probe.js';
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35),localizer=await loadObjectInference('helmet-head-localizer',.25);
const old=await loadHelmetClassificationInference('helmet'),head=await loadHelmetClassificationInference('helmet-head-evidence');
const verifier=new LocalizedHelmetHeadVerifier(localizer,old,null,null,head);
const detector=new HelmetDetector(null,.75,old,true,verifier);await detector.initialize();
const results=[];
try{for(const [file,expectedHelmet] of [['walking.jpg',true],['carried.jpg',false]]){
 const {data,info}=await sharp(process.argv[2]+'/'+file).resize(640,360).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'isolated-deployment-check-'+file,tenantId:'offline',timestamp:new Date(0),width:info.width,height:info.height,imageData:data,metadata:{inferenceMode:'local-onnx',detections:[]}};
 frame.metadata.detections=await objects.run(frame);
 const alerts=await detector.detect(frame);
 const row={file,expectedHelmet,alertResults:alerts.length,confidence:alerts[0]?.confidence??null,eventsSubmitted:0};
 results.push(row);if(!!alerts.length!==expectedHelmet)throw Error('Deployed classifier replay failed: '+file);
}console.log('BETTIAH_REPLAY_VALIDATION '+JSON.stringify({validation:'Isolated archived-frame replay; no live events or notifications submitted',probeSha256:HELMET_HEAD_PROBE_SHA256,results}));}
finally{await detector.cleanup();await manager.shutdown();}
process.exit(0);
