import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

const reader = `
import {createRequire} from 'node:module';
const {createClient}=createRequire('/app/package.json')('redis');
import {loadConfig} from '/app/dist/src/config.js';
const r=createClient({url:loadConfig().REDIS_URL});await r.connect();
try {
 for(let i=0;i<8;i++) {
  for(const cameraId of ['fb465a8f-5d79-4a3f-9cb8-b8cec471708d','99455d3a-3411-43ad-b756-84a4ae17c026']) {
   const raw=await r.get('analytics:latest-frame:'+cameraId);
   if(raw)console.log(JSON.stringify({...JSON.parse(raw),cameraId}));
  }
  if(i<7)await new Promise(resolve=>setTimeout(resolve,2500));
 }
} finally {await r.quit();}
`;
const diagnostic = `
import readline from 'node:readline';
import {createRequire} from 'node:module';
const sharp=createRequire('/app/package.json')('sharp');
import {getModelManager} from '/app/dist/analytics-engine/src/model-manager.js';
import {loadObjectInference,loadHelmetClassificationInference,loadPoseInference} from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';
import {LocalizedHelmetHeadVerifier} from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import {HelmetDetector} from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
const lines=readline.createInterface({input:process.stdin});
const incoming=lines[Symbol.asyncIterator]();
const manager=getModelManager({modelsDirectory:'/app/models',enableGPU:false,startCleanupTimer:false});await manager.initialize();
let helmet;
try {
 const objects=await loadObjectInference('yolov8n',.35),classifier=await loadHelmetClassificationInference('helmet'),localizer=await loadObjectInference('helmet-head-localizer',.25);
 let faces=null,poses=null;
 try{faces=await loadObjectInference('face-detector',.6);}catch{}
 try{poses=await loadPoseInference('pose-estimator',.4);}catch{}
 let calls=[];
 const traced={run:async(f,crop)=>{const result=await classifier.run(f,crop);calls.push({crop,result});return result;}};
 const verifier=new LocalizedHelmetHeadVerifier(localizer,traced,faces,poses);
 const configured=Number(process.env.HELMET_CONFIDENCE_THRESHOLD??.88);
 helmet=new HelmetDetector(null,configured,traced,process.env.HELMET_FAST_ALERT!=='false',verifier);await helmet.initialize();
 const seen=new Map();
 console.log('CONFIG_JSON '+JSON.stringify({threshold:configured,fastAlert:process.env.HELMET_FAST_ALERT!=='false',face:!!faces,pose:!!poses}));
 for await(const line of incoming) {
  if(!line.trim())continue;
  const sample=JSON.parse(line);
  if(seen.get(sample.cameraId)===sample.capturedAt)continue;
  seen.set(sample.cameraId,sample.capturedAt);
  const data=Buffer.from(sample.imageBase64,'base64');
  if(data.length!==640*360*3)throw new Error('Expected 640x360 RGB24');
  const frame={cameraId:'isolated-walking-'+sample.cameraId,tenantId:'isolated',timestamp:new Date(sample.capturedAt),
   imageData:data,width:640,height:360,metadata:{inferenceMode:'local-onnx'}};
  const detections=await objects.run(frame);frame.metadata.detections=detections;
  calls=[];
  const results=await helmet.detect(frame);
  const snapshotBase64=(await sharp(data,{raw:{width:640,height:360,channels:3}}).jpeg().toBuffer()).toString('base64');
  console.log('DIAG_JSON '+JSON.stringify({cameraId:sample.cameraId,capturedAt:sample.capturedAt,checkedAt:new Date().toISOString(),
   persons:detections.filter(o=>o.label==='person'),heads:await localizer.run(frame),
   faces:faces?await faces.run(frame):[],poses:poses?await poses.run(frame):[],classificationCalls:calls,
   results:results.map(r=>({type:r.detectionType,confidence:r.confidence,metadata:r.metadata})),
   pending:helmet.pendingHeads.get(frame.cameraId)??[],eventsSubmitted:0,snapshotBase64}));
 }
}finally{if(helmet)await helmet.cleanup();await manager.shutdown();}
process.exit(0);
`;
const remote = `set -euo pipefail
stage=$(mktemp -d /tmp/kollam-walking-diagnostic.XXXXXX)
echo '${Buffer.from(reader).toString('base64')}' | base64 -d > "$stage/reader.mjs"
echo '${Buffer.from(diagnostic).toString('base64')}' | base64 -d > "$stage/diagnostic.mjs"
sudo docker cp "$stage/reader.mjs" sentinel-gcp-control-plane:/tmp/kollam-walking-reader-20261007.mjs
sudo docker cp "$stage/diagnostic.mjs" sentinel-gcp-analytics-engine:/tmp/kollam-walking-diagnostic-20261007.mjs
sudo docker exec sentinel-gcp-control-plane node /tmp/kollam-walking-reader-20261007.mjs | sudo docker exec -i sentinel-gcp-analytics-engine node /tmp/kollam-walking-diagnostic-20261007.mjs
`;
const encoded=gzipSync(Buffer.from(remote)).toString('base64');
const command='gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '+encoded+' | base64 -d | gzip -d | bash"';
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
const samples=[];let config;
for(const line of (result.stdout??'').split('\n')) {
 if(line.startsWith('CONFIG_JSON '))config=JSON.parse(line.slice(12));
 if(!line.startsWith('DIAG_JSON '))continue;
 const sample=JSON.parse(line.slice(10));
 const snapshot='tmp/kollam-live-'+sample.cameraId+'-'+sample.capturedAt.replace(/[^0-9]/g,'')+'.jpg';
 fs.writeFileSync(snapshot,Buffer.from(sample.snapshotBase64,'base64'));delete sample.snapshotBase64;
 sample.snapshot=snapshot;samples.push(sample);
}
fs.writeFileSync('reports/kollam-walking-live-2026-10-07.json',JSON.stringify({config,samples},null,2));
fs.writeFileSync('tmp/kollam-walking-live-20261007.log',(result.stdout??'').split('\n').filter(l=>!l.startsWith('DIAG_JSON ')).join('\n'));
console.log(JSON.stringify({config,samples:samples.map(s=>({cameraId:s.cameraId,capturedAt:s.capturedAt,persons:s.persons,
 heads:s.heads,classificationCalls:s.classificationCalls,results:s.results,pending:s.pending,snapshot:s.snapshot}))},null,2));
if(result.stderr)process.stderr.write(result.stderr);
if(result.status!==0)throw new Error('Isolated diagnostic failed: '+result.status);
