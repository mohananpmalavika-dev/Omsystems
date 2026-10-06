set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import {createClient} from 'redis';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
try{
console.log('CHECKED_AT',new Date().toISOString());
const cameras=(await db.query(`SELECT c.id,c.channel,c.recorder_channel,c.status,cn.name,c.edge_agent_id,
 e.last_seen_at AS edge_last_seen_at FROM cameras c JOIN resource_nodes cn ON cn.id=c.resource_node_id
 LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104'
 ORDER BY c.channel NULLS LAST,cn.name`)).rows;
for(const camera of cameras){
 const raw=await redis.get(`analytics:latest-frame:${camera.id}`),frame=raw?JSON.parse(raw):null;
 const rules=(await db.query(`SELECT detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds,archived_at
 FROM analytics_rules WHERE camera_id=$1 AND detection_type IN ('helmet','helmet-worn')`,[camera.id])).rows;
 const events=(await db.query(`SELECT id,detection_type,occurred_at,confidence,model_version,status FROM analytics_events
 WHERE camera_id=$1 AND detection_type IN ('helmet','helmet-worn') AND occurred_at>now()-interval '30 minutes'
 ORDER BY occurred_at DESC LIMIT 5`,[camera.id])).rows;
 const alerts=(await db.query(`SELECT id,title,created_at,confidence,status FROM analytics_alerts WHERE camera_id=$1
 AND title ILIKE '%helmet%' AND created_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 5`,[camera.id])).rows;
 console.log('CAMERA',JSON.stringify({...camera,frameCapturedAt:frame?.capturedAt??null,
 frameTtlSeconds:await redis.ttl(`analytics:latest-frame:${camera.id}`),rules,events,alerts}));
}
}finally{await redis.quit();await db.end();}
JS
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const manager=fs.readFileSync('/app/dist/analytics-engine/src/model-manager.js','utf8');
const helmet=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('RUNTIME',JSON.stringify({checkedAt:new Date().toISOString(),aiState:h.aiState,
 sessionLifetimeFixPresent:manager.includes('createModelHandle'),detectorVersion:helmet.match(/super\("helmet", "([^"]+)"\)/)?.[1],
 helmet:h.pipeline?.detectors?.helmet,notifications:h.notifications}));
JS
sudo docker logs --since 10m sentinel-gcp-analytics-engine 2>&1 | sudo docker exec -i sentinel-gcp-control-plane node -e '
let raw="";process.stdin.on("data",c=>raw+=c);process.stdin.on("end",()=>{
const errors=[];for(const line of raw.split("\n")){let v;try{v=JSON.parse(line);}catch{continue;}
if(v.res?.statusCode>=500)errors.push({time:v.time,msg:v.msg,status:v.res.statusCode});}
console.log("RECENT_FAILURES",JSON.stringify({http500Count:errors.length,last:errors.slice(-5),disposedSessionMessageCount:Array.from(raw.matchAll(/"message"\s*:\s*"Session already disposed\."/g)).length}));});'
