#!/usr/bin/env bash
set -eu
stage=/tmp/sentinel-helmet-rajkot-1.2.2-20261006
test -f "$stage/deployed.txt"
trap 'rm -f "$stage/live-check.env"' EXIT
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import {createClient} from 'redis';import fs from 'node:fs';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
try{
 const camera='6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7';
 const raw=await redis.get(`analytics:latest-frame:${camera}`),frame=raw?JSON.parse(raw):null;
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),cameraId:camera,frameCapturedAt:frame?.capturedAt,
  frameAgeSeconds:frame?Math.round((Date.now()-Date.parse(frame.capturedAt))/1000):null}));
 console.log('RULES',JSON.stringify((await db.query(`SELECT detection_type,enabled,min_confidence,min_duration_seconds FROM analytics_rules WHERE camera_id=$1 AND detection_type IN ('helmet','helmet-worn')`,[camera])).rows));
 console.log('LATEST_EVENTS',JSON.stringify((await db.query(`SELECT occurred_at,detection_type,model_version FROM analytics_events WHERE camera_id=$1 ORDER BY occurred_at DESC LIMIT 5`,[camera])).rows));
 console.log('RECENT_HELMET_ALERTS',JSON.stringify((await db.query(`SELECT created_at,status FROM analytics_alerts WHERE camera_id=$1 AND title ILIKE '%helmet%' ORDER BY created_at DESC LIMIT 5`,[camera])).rows));
}finally{await redis.quit();await db.end();}
JS
sudo docker inspect sentinel-gcp-control-plane --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n '/^REDIS_URL=/p' > "$stage/live-check.env"
chmod 600 "$stage/live-check.env"
network=$(sudo docker inspect sentinel-gcp-analytics-engine --format '{{range $name, $net := .NetworkSettings.Networks}}{{println $name}}{{end}}' | head -n 1)
sudo docker run --rm -i --network "$network" --volumes-from sentinel-gcp-analytics-engine:ro --env-file "$stage/live-check.env" \
 -e MODELS_DIR=/app/models --entrypoint node sentinel-gcp-analytics-engine:helmet-rajkot-1.2.2-20261006 --input-type=module <<'JS'
import {createClient} from 'redis';import sharp from 'sharp';
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
const detector=new HelmetDetector(null,.88,classifier,true,new LocalizedHelmetHeadVerifier(localizer,classifier));await detector.initialize();
const captures=new Set();let alerts=0;
try{
 for(let i=0;i<6;i++){
  const raw=await redis.get('analytics:latest-frame:6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7');
  if(!raw)throw new Error('No current Rajkot frame');
  const cached=JSON.parse(raw),age=(Date.now()-Date.parse(cached.capturedAt))/1000;
  if(age>60)throw new Error('Camera frame is stale');
  const {data,info}=await sharp(Buffer.from(cached.imageBase64,'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frame={cameraId:'isolated-live-rajkot',tenantId:'isolated',timestamp:new Date(cached.capturedAt),width:info.width,height:info.height,imageData:data};
  const detections=await objects.run(frame);
  const results=await detector.detect({...frame,metadata:{inferenceMode:'local-onnx',detections}});
  const count=results.filter(r=>r.requiresAlert).length;alerts+=count;captures.add(cached.capturedAt);
  console.log(JSON.stringify({sample:i+1,capturedAt:cached.capturedAt,frameAgeSeconds:Math.round(age),persons:detections.filter(o=>o.label==='person').length,helmetAlerts:count}));
  if(i<5)await new Promise(r=>setTimeout(r,10000));
 }
 console.log(JSON.stringify({liveDistinctFrames:captures.size,helmetAlerts:alerts,eventsSubmitted:0}));
 if(captures.size<2||alerts!==0)throw new Error('Live validation failed');
}finally{await detector.cleanup();await redis.quit();await manager.shutdown();}
process.exit(0);
JS
rm "$stage/live-check.env"
