import fs from 'node:fs';import sharp from 'sharp';
import {getModelManager} from '../analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '../analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '../analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '../analytics-engine/src/detectors/helmet-detector.js';
const manager=getModelManager({modelsDirectory:'analytics-engine/models',enableGPU:false,startCleanupTimer:false});
await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35),localizer=await loadObjectInference('helmet-head-localizer',.25);
const old=await loadHelmetClassificationInference('helmet'),head=await loadHelmetClassificationInference('helmet-head-evidence');
const verifier=new LocalizedHelmetHeadVerifier(localizer,old,null,null,head);
const detector=new HelmetDetector(null,.75,old,true,verifier);await detector.initialize();const rows=[];
try{for(let i=33;i<=44;i++){
 const file='scratch/bettiah-entry-20261008/ch5/frame-'+String(i).padStart(3,'0')+'.jpg';
 const {data,info}=await sharp(file).resize(640,360).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const frame={cameraId:'bettiah-offline',tenantId:'isolated',timestamp:new Date(Date.UTC(2026,9,8,4,37,1)+i*2000),width:info.width,height:info.height,imageData:data,metadata:{inferenceMode:'local-onnx',detections:[] as any[]}};
 frame.metadata.detections=await objects.run(frame);const persons=frame.metadata.detections.filter(p=>p.label==='person');
 const verification=[];for(const p of persons)verification.push({person:p,head:await verifier.verify(frame,p.boundingBox,.8)});
 const alerts=await detector.detect(frame);rows.push({file,verification,alerts,eventsSubmitted:0});
 console.log(JSON.stringify({file,alerts:alerts.length}));
}fs.writeFileSync(process.argv[2],JSON.stringify({checkedAt:new Date().toISOString(),timing:'Nominal recording PTS; no production events submitted',rows},null,2));}
finally{await detector.cleanup();await manager.shutdown();}process.exit(0);