import pg from 'pg';
import sharp from 'sharp';
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
try {
 const {rows}=await db.query(`SELECT id,metadata FROM analytics_events WHERE camera_id=$1 AND detection_type='helmet-worn'
 AND occurred_at BETWEEN '2026-10-06T12:50:00Z' AND '2026-10-06T13:02:00Z' ORDER BY occurred_at LIMIT 12`,['6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7']);
 if(rows.length<3)throw new Error('Insufficient original false-alert evidence for validation');
 const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 let tested=0;
 for(const row of rows){
  if(!row.metadata?.snapshotBase64)throw new Error('Missing original evidence');
  const {data,info}=await sharp(Buffer.from(row.metadata.snapshotBase64.replace(/^data:image\/[^;]+;base64,/,''),'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:'isolated-server-regression',tenantId:'isolated',timestamp:new Date(0),imageData:data,width:info.width,height:info.height};
  const detections=await objects.run(frame),verifier=new LocalizedHelmetHeadVerifier(localizer,classifier);
  for(const person of detections.filter(o=>o.label==='person')){
   if(await verifier.verify(frame,person.boundingBox,.9167))throw new Error(`False head verification for ${row.id}`);
  }
  for(const fast of [false,true]){
   const detector=new HelmetDetector(null,.88,classifier,fast,verifier);await detector.initialize();
   for(const second of [0,0,2,4]){
    const results=await detector.detect({...frame,timestamp:new Date(second*1000),metadata:{inferenceMode:'local-onnx',detections}});
    if(results.some(r=>r.requiresAlert))throw new Error(`False helmet alert for ${row.id}`);
   }
   await detector.cleanup();
  }
  tested++;console.log(JSON.stringify({eventId:row.id,passed:true}));
 }
 console.log(JSON.stringify({serverOriginalFramesPassed:tested,eventsSubmitted:0}));
}finally{await db.end();await manager.shutdown();}
process.exit(0);
