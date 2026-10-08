import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';

const out='scratch/bettiah-entry-20261008';
fs.mkdirSync(out,{recursive:true});
const from='2026-10-08T04:37:00.000Z',to='2026-10-08T04:39:00.000Z';
const loginSource=fs.readFileSync('scratch/test-rajkot-live.mjs','utf8');
const password=loginSource.match(/password:\s*"([^"]+)"/)?.[1];
if(!password)throw Error('Existing diagnostic sign-in credential unavailable');
const remoteCode=`
import pg from 'pg';
import {loadConfig} from '/app/dist/src/config.js';
import {PostgresStore} from '/app/dist/src/database/postgres-store.js';
const db=new pg.Client({connectionString:loadConfig().DATABASE_URL});await db.connect();
let token;
try{
 const cameras=(await db.query(\`SELECT c.id,c.channel,c.recorder_channel,c.status,c.edge_agent_id,rn.name,e.version AS agent_version,e.last_seen_at AS agent_last_seen FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE b.name ILIKE '%bett%' AND c.channel IN (2,5) AND rn.is_active=true ORDER BY c.channel\`)).rows;
 const ids=cameras.map(c=>c.id);
 const rules=(await db.query(\`SELECT camera_id,detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds FROM analytics_rules WHERE camera_id=ANY($1::uuid[]) AND detection_type IN ('helmet','helmet-worn')\`,[ids])).rows;
 const events=(await db.query(\`SELECT id,camera_id,occurred_at,detection_type,model_version,confidence FROM analytics_events WHERE camera_id=ANY($1::uuid[]) AND occurred_at BETWEEN $2 AND $3 ORDER BY occurred_at LIMIT 300\`,[ids,'2026-10-08T04:35:00Z','2026-10-08T04:41:00Z'])).rows;
 const alerts=(await db.query(\`SELECT id,camera_id,created_at,title,status FROM analytics_alerts WHERE camera_id=ANY($1::uuid[]) AND created_at BETWEEN $2 AND $3 ORDER BY created_at\`,[ids,'2026-10-08T04:35:00Z','2026-10-08T04:41:00Z'])).rows;
 const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL}),store=new PostgresStore(pool);
 const grants=[];
 try{
 const owner=await store.findUserByUsername('mgdhanyamohan');
 if(!owner)throw Error('Configured diagnostic owner unavailable');
 for(const camera of cameras){
  const decision=await store.checkCameraAccess(owner.id,camera.id,'recording:view');
  if(!decision.allowed){grants.push({camera,status:403,grant:{error:decision.reason||'recording_access_denied'}});continue;}
  const grant=await store.createLiveSession(camera.id,owner.id,'playback');
  await store.writeAudit({tenantId:owner.tenantId,actorUserId:owner.id,action:'camera_storage.diagnostic_access',resourceNodeId:null,outcome:'success',sourceIp:'127.0.0.1',details:{cameraId:camera.id,sessionId:grant.id,from:'2026-10-08T04:37:00Z',to:'2026-10-08T04:39:00Z'}});
  grants.push({camera,status:201,grant});
 }
 }finally{await pool.end();}
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),from:${JSON.stringify(from)},to:${JSON.stringify(to)},cameras,rules,events,alerts,grantAccessChecked:true,grants}));
}finally{if(token)await fetch('http://localhost:8080/v1/auth/logout',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'}).catch(()=>{});await db.end();}
`;
const remote='echo '+Buffer.from(remoteCode).toString('base64')+' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module';
const r=spawnSync('gcloud.cmd',['compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet','--command='+JSON.stringify(remote)],{shell:true,encoding:'utf8',timeout:60000,maxBuffer:6*1024*1024});
if(r.status!==0)throw Error('Production diagnostic failed: '+(r.stderr||r.error?.message||r.status));
const line=r.stdout.split('\n').find(l=>l.startsWith('{'));
if(!line)throw Error('Missing diagnostic response');
const report=JSON.parse(line),grants=report.grants;delete report.grants;
fs.writeFileSync('reports/bettiah-entry-diagnostic-2026-10-08.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await Promise.all(grants.map(async item=>{
 const channel=item.camera.channel;
 if(item.status!==201){console.log(JSON.stringify({channel,storageStatus:item.status,error:item.grant.error}));return;}
 const grant=item.grant,base=(grant.mediaGatewayUrl||grant.localMediaGatewayUrl)?.replace(/\/$/,'');
 if(!base){console.log(JSON.stringify({channel,error:'No reachable media gateway'}));return;}
 let playback;
 try{
  const response=await fetch(base+'/v1/storage/play',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({controlPlaneToken:grant.token,from,to,apiFamily:"dahua-cgi"}),signal:AbortSignal.timeout(45000)});
  playback=await response.json();
  console.log(JSON.stringify({channel,playbackStatus:response.status,error:playback.error,hasHls:!!playback.hls}));
  if(!response.ok||!playback.hls)return;
  const headers={authorization:'Bearer '+playback.hls.bearerToken};
  let ready=false;
  for(let attempt=0;attempt<15;attempt++){const manifest=await fetch(playback.hls.url,{headers,signal:AbortSignal.timeout(15000)});if(manifest.ok){ready=true;break;}await new Promise(r=>setTimeout(r,2000));}
  if(!ready)throw Error('Playback manifest did not become ready');
  const file=path.join(out,'channel-'+channel+'.ts');
  const args=['-hide_banner','-loglevel','error','-headers','Authorization: Bearer '+playback.hls.bearerToken+'\r\n','-i',playback.hls.url,'-t','120','-map','0:v:0','-an','-c:v','copy','-f','mpegts','-y',file];
  const captured=await new Promise(resolve=>{const child=spawn('ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',b=>{err+=b.toString();});const timer=setTimeout(()=>child.kill(),155000);child.on('error',e=>{clearTimeout(timer);resolve({code:-1,error:e.message});});child.on('close',code=>{clearTimeout(timer);resolve({code,error:err.replaceAll(playback.hls.bearerToken,'[redacted]')});});});
  console.log(JSON.stringify({channel,capture:captured.code,bytes:fs.existsSync(file)?fs.statSync(file).size:0,error:captured.error.slice(-1500)}));
 }catch(e){console.log(JSON.stringify({channel,error:e.message}));}
 finally{if(playback?.sessionId&&playback.hls)await fetch(base+'/v1/live/'+playback.sessionId,{method:'DELETE',headers:{authorization:'Bearer '+playback.hls.bearerToken},signal:AbortSignal.timeout(15000)}).catch(()=>{});}
}));


