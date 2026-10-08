import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';

const config=loadConfig();
const db=new pg.Client({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});
redis.on('error',()=>{});
await db.connect();
await redis.connect();
try {
 await db.query('BEGIN READ ONLY');
 await db.query("SET LOCAL statement_timeout='15s'");
 const cameras=(await db.query(`SELECT c.id,c.channel,c.recorder_channel,c.status,c.last_seen_at,
 c.edge_agent_id,rn.name,c.branch_node_id,e.version AS agent_version,
 e.last_seen_at AS agent_last_seen,e.status AS agent_status
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id
 JOIN resource_nodes b ON b.id=c.branch_node_id
 LEFT JOIN edge_agents e ON e.id=c.edge_agent_id
 WHERE b.name ILIKE '%rajkot%' AND rn.is_active=true ORDER BY c.channel`)).rows;
 const ids=cameras.map(c=>c.id);
 for(const c of cameras){
  const raw=await redis.get('analytics:latest-frame:'+c.id);
  if(!raw){c.frame=null;continue;}
  const f=JSON.parse(raw);
  c.frame={capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,
   width:f.width,height:f.height,encoding:f.imageEncoding,byteLength:f.imageBase64?Buffer.from(f.imageBase64,'base64').length:null};
 }
 const queries={
  rules:[`SELECT id,camera_id,detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds
   FROM analytics_rules WHERE camera_id=ANY($1::uuid[]) AND detection_type IN ('helmet','helmet-worn')`,[ids]],
  todayEvents:[`SELECT camera_id,detection_type,model_version,count(*)::int AS count,
   min(occurred_at) AS first_event,max(occurred_at) AS last_event,max(confidence) AS max_confidence
   FROM analytics_events WHERE camera_id=ANY($1::uuid[])
   AND occurred_at >= '2026-10-07T18:30:00Z' GROUP BY camera_id,detection_type,model_version
   ORDER BY last_event DESC`,[ids]],
  helmetEvents:[`SELECT id,camera_id,occurred_at,detection_type,model_version,confidence
   FROM analytics_events WHERE camera_id=ANY($1::uuid[]) AND detection_type IN ('helmet','helmet-worn')
   ORDER BY occurred_at DESC LIMIT 30`,[ids]],
  todayAlerts:[`SELECT id,camera_id,created_at,status,title FROM analytics_alerts
   WHERE camera_id=ANY($1::uuid[]) AND created_at >= '2026-10-07T18:30:00Z'
   ORDER BY created_at DESC LIMIT 30`,[ids]],
  notifications:[`SELECT n.channel,n.status,n.attempts,n.updated_at,a.id AS alert_id,a.camera_id,a.title
   FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id
   WHERE a.camera_id=ANY($1::uuid[]) AND a.created_at >= '2026-10-07T18:30:00Z'
   ORDER BY n.updated_at DESC LIMIT 30`,[ids]],
  schema:[`SELECT table_name,column_name FROM information_schema.columns
   WHERE table_name IN ('analytics_events','camera_discoveries','edge_commands')
   ORDER BY table_name,ordinal_position`,[]]
 };
 const report={checkedAt:new Date().toISOString(),hdCapture:config.HELMET_HD_CAPTURE_CAMERAS,
  updateVersion:config.EDGE_PACKAGED_UPDATE_VERSION,updateTargets:config.EDGE_PACKAGED_UPDATE_TARGET_AGENTS,cameras};
 for(const [key,[sql,params]] of Object.entries(queries))report[key]=(await db.query(sql,params)).rows;
 await db.query('COMMIT');
 console.log(JSON.stringify(report,null,2));
}finally{await redis.quit();await db.end();}
