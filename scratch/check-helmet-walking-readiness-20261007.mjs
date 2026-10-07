import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const cameraId='e66e3498-1c13-4f59-91d7-5a3386d269d2';
const control=`
import pg from 'pg';import {createClient} from 'redis';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try{
 const rules=(await pool.query("SELECT min_confidence,count(DISTINCT camera_id)::int AS cameras FROM analytics_rules WHERE enabled=true AND detection_type='helmet-worn' GROUP BY min_confidence ORDER BY min_confidence")).rows;
 const camera=(await pool.query("SELECT c.id,c.channel,c.recorder_channel,e.id AS agent_id,e.version AS agent_version,e.status AS agent_status,e.last_seen_at FROM cameras c LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE c.id=$1",['${cameraId}'])).rows[0];
 const cameraRules=(await pool.query("SELECT enabled,min_confidence,min_duration_seconds,cooldown_seconds FROM analytics_rules WHERE camera_id=$1 AND detection_type='helmet-worn'",['${cameraId}'])).rows;
 const alerts=(await pool.query("SELECT id,camera_id,title,confidence,first_detected_at,last_detected_at,created_at,status FROM analytics_alerts WHERE camera_id=$1 AND title ILIKE '%helmet%' ORDER BY first_detected_at DESC LIMIT 3",['${cameraId}'])).rows;
 const raw=await redis.get('analytics:latest-frame:${cameraId}'),frame=raw?JSON.parse(raw):null;
 console.log('CONTROL_RESULT '+JSON.stringify({checkedAt:new Date().toISOString(),rules,camera,cameraRules,alerts,
  hdCaptureCameras:config.HELMET_HD_CAPTURE_CAMERAS??null,
  patchVersion:config.EDGE_PACKAGED_UPDATE_VERSION??null,patchTargets:config.EDGE_PACKAGED_UPDATE_TARGET_AGENTS??null,
  controlRoutesSha256:createHash('sha256').update(fs.readFileSync('/app/dist/src/routes/edge-gateway-operations.routes.js')).digest('hex'),
  frame:frame?{capturedAt:frame.capturedAt,width:frame.width??null,height:frame.height??null,
   imageEncoding:frame.imageEncoding??'unspecified',bytes:Buffer.from(frame.imageBase64,'base64').length,
   ageSeconds:(Date.now()-Date.parse(frame.capturedAt))/1000}:null}));
}finally{await redis.quit();await pool.end();}
`;
const analytics=`
import fs from 'node:fs';import {createHash} from 'node:crypto';
const health=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
const app=fs.readFileSync('/app/dist/analytics-engine/src/app.js','utf8');
console.log('ANALYTICS_RESULT '+JSON.stringify({checkedAt:new Date().toISOString(),aiState:health.aiState,
 helmet:health.pipeline?.detectors?.helmet,models:{ready:health.pipeline?.models?.ready,
  loaded:(health.pipeline?.models?.models??[]).filter(item=>item.status==='loaded').map(item=>item.id)},
 modelVersion:code.match(/super\\("helmet", "([^\"]+)"\\)/)?.[1],
 detectorSha256:createHash('sha256').update(code).digest('hex'),
 sourcePixelPersonGate:code.includes('person.boundingBox.height * frame.height < 72'),
 relativePersonGate:code.includes('person.boundingBox.height < 0.35'),
 jpegIngress:app.includes('input.imageEncoding === "jpeg"'),
 headEvidenceCameras:process.env.HELMET_HEAD_EVIDENCE_CAMERAS??'',
 fastAlert:process.env.HELMET_FAST_ALERT??null,
 configuredConfidence:process.env.HELMET_CONFIDENCE_THRESHOLD??null}));
`;

const remote=[['sentinel-gcp-control-plane',control],['sentinel-gcp-analytics-engine',analytics]]
 .map(([container,script])=>"echo '"+Buffer.from(script).toString('base64')+"' | base64 -d | sudo docker exec -i "+container+" node --input-type=module").join('\n');
const command="echo '"+gzipSync(Buffer.from('set -euo pipefail\n'+remote)).toString('base64')+"' | base64 -d | gzip -d | bash";
const result=spawnSync('gcloud',['compute','ssh','kryptovision-server','--zone=asia-south1-b',
 '--project=project-7866fc3f-5dd5-4495-804','--quiet','--command="'+command+'"'],
 {shell:process.platform==='win32',encoding:'utf8',timeout:90_000,maxBuffer:2*1024*1024});
if(result.status!==0){if(result.stderr)process.stderr.write(result.stderr);throw new Error('Read-only readiness check failed: '+result.status);}
const parse=prefix=>{
 const line=(result.stdout??'').split(/\r?\n/).find(line=>line.startsWith(prefix));
 if(!line)throw new Error('Missing '+prefix);return JSON.parse(line.slice(prefix.length));
};
const report={control:parse('CONTROL_RESULT '),analytics:parse('ANALYTICS_RESULT ')};
const local=fs.readFileSync('analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js');
report.localDetectorSha256=createHash('sha256').update(local).digest('hex');
report.runtimeMatchesLocal=report.localDetectorSha256===report.analytics.detectorSha256;
report.localControlRoutesSha256=createHash('sha256').update(fs.readFileSync('dist/src/routes/edge-gateway-operations.routes.js')).digest('hex');
report.controlRoutesMatchLocal=report.localControlRoutesSha256===report.control.controlRoutesSha256;
const hdScope=new Set((report.control.hdCaptureCameras??'').split(',').map(id=>id.trim()).filter(Boolean));
const gatewayVersion=(report.control.camera?.agent_version??'0.0.0').split('.').map(Number);
const gatewayReady=gatewayVersion[0]>0||gatewayVersion[1]>1||(gatewayVersion[1]===1&&gatewayVersion[2]>=49);
const frame=report.control.frame;
report.checks={helmetHealthy:report.analytics.helmet?.status==='healthy',
 sourcePixelPersonGate:report.analytics.sourcePixelPersonGate,jpegIngress:report.analytics.jpegIngress,
 runtimeMatchesLocal:report.runtimeMatchesLocal,controlRoutesMatchLocal:report.controlRoutesMatchLocal,
 pilotPatchScope:report.control.patchVersion==='0.1.49'&&report.control.patchTargets==='e9b95595-1aa6-4a14-9f5d-bd0c958d3f34',
 hdRequested:hdScope.has('*')||hdScope.has(cameraId),
 gatewayVersionReady:gatewayReady,frameFresh:!!frame&&frame.ageSeconds>=0&&frame.ageSeconds<=10,
 hdFrame:frame?.width===1280&&frame?.height===720&&frame?.imageEncoding==='jpeg'};
report.ready=Object.values(report.checks).every(Boolean);
fs.writeFileSync('reports/helmet-walking-readiness-2026-10-07.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ready)process.exitCode=2;
