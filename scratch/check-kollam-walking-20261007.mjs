import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const control = `
import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try {
 const cameras=(await pool.query(\`SELECT c.id,c.channel,c.recorder_channel,n.name
 FROM cameras c JOIN resource_nodes n ON n.id=c.branch_node_id WHERE n.name ILIKE '%kollam%'\`)).rows;
 console.log('CHECKED_AT',new Date().toISOString());
 for(const camera of cameras) {
  console.log('CAMERA',JSON.stringify(camera));
  console.log('RULES',JSON.stringify((await pool.query(\`SELECT enabled,min_confidence,min_duration_seconds,cooldown_seconds
   FROM analytics_rules WHERE camera_id=$1 AND detection_type='helmet-worn'\`,[camera.id])).rows));
  console.log('RECENT_EVENTS',JSON.stringify((await pool.query(\`SELECT occurred_at,confidence,model_version
   FROM analytics_events WHERE camera_id=$1 AND detection_type='helmet-worn' AND occurred_at>now()-interval '2 hours'
   ORDER BY occurred_at DESC LIMIT 5\`,[camera.id])).rows));
  console.log('RECENT_ALERTS',JSON.stringify((await pool.query(\`SELECT created_at,last_detected_at,status,confidence
   FROM analytics_alerts WHERE camera_id=$1 AND title ILIKE '%helmet%' AND created_at>now()-interval '2 hours'
   ORDER BY created_at DESC LIMIT 5\`,[camera.id])).rows));
  const raw=await redis.get('analytics:latest-frame:'+camera.id);
  const f=raw?JSON.parse(raw):null;
  console.log('FRAME',JSON.stringify({cameraId:camera.id,ttl:await redis.ttl('analytics:latest-frame:'+camera.id),
   capturedAt:f?.capturedAt,bytes:f?Buffer.from(f.imageBase64,'base64').length:0}));
 }
} finally {await redis.quit();await pool.end();}
`;
const analytics = `
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('DETECTOR_BASE64',Buffer.from(code).toString('base64'));
console.log('HEALTH',JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,
 version:code.match(/super\\("helmet", "([^\"]+)"\\)/)?.[1],
 strictPruning:code.includes('calculateIoU(item.personBox, person.boundingBox) >= 0.5'),
 lenientConfirmation:code.includes('iou >= 0.2'),wideProximity:code.includes('distance < 0.4')}));
`;
let output='';
for(const [container,script] of [['sentinel-gcp-control-plane',control],['sentinel-gcp-analytics-engine',analytics]]) {
 const result=spawnSync('gcloud',['compute','ssh','kryptovision-server','--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804','--quiet',
  '--command="echo '+Buffer.from(script).toString('base64')+' | base64 -d | sudo docker exec -i '+container+' node --input-type=module"'],
  {encoding:'utf8',shell:process.platform==='win32',timeout:90000});
 for(const line of (result.stdout??'').split('\n')) {
  if(line.startsWith('DETECTOR_BASE64 ')) {
   fs.writeFileSync('tmp/kollam-running-helmet-detector-20261007.js',Buffer.from(line.slice('DETECTOR_BASE64 '.length).trim(),'base64'));
  } else if(line.trim()) output+=line+'\n';
 }
 if(result.stderr) process.stderr.write(result.stderr);
 if(result.status!==0) {process.stdout.write(output);throw new Error('Read-only diagnostic failed: '+result.status);}
}
fs.writeFileSync('tmp/kollam-walking-status-20261007.log',output);
process.stdout.write(output);
