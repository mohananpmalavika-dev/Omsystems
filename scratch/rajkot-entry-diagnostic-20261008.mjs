import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const cfg=loadConfig(),db=new pg.Client({connectionString:cfg.DATABASE_URL});
const redis=createClient({url:cfg.REDIS_URL});redis.on('error',()=>{});
await db.connect();await redis.connect();
try{
 await db.query('BEGIN READ ONLY');
 await db.query("SET LOCAL statement_timeout='15s'");
 const cams=(await db.query(`SELECT c.id,c.channel,c.status,c.edge_agent_id,rn.name,e.version AS agent_version,e.last_seen_at AS agent_last_seen FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE b.name ILIKE '%rajkot%' AND rn.is_active=true ORDER BY c.channel`)).rows;
 const ids=cams.map(c=>c.id);
 for(const c of cams){const raw=await redis.get('analytics:latest-frame:'+c.id);const f=raw?JSON.parse(raw):null;c.frame=f?{capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,width:f.width,height:f.height,encoding:f.imageEncoding}:null;}
 const rules=(await db.query(`SELECT id,camera_id,detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds FROM analytics_rules WHERE camera_id=ANY($1::uuid[]) AND detection_type IN ('helmet','helmet-worn')`,[ids])).rows;
 const events=(await db.query(`SELECT camera_id,detection_type,model_version,count(*)::int AS count,min(occurred_at) AS first_event,max(occurred_at) AS last_event,max(confidence) AS max_confidence FROM analytics_events WHERE camera_id=ANY($1::uuid[]) AND occurred_at >= '2026-10-07T18:30:00Z' GROUP BY camera_id,detection_type,model_version ORDER BY last_event DESC`,[ids])).rows;
 const alerts=(await db.query(`SELECT id,camera_id,created_at,status,title FROM analytics_alerts WHERE camera_id=ANY($1::uuid[]) AND created_at >= '2026-10-07T18:30:00Z' ORDER BY created_at DESC LIMIT 30`,[ids])).rows;
 await db.query('COMMIT');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),hdCapture:cfg.HELMET_HD_CAPTURE_CAMERAS,updateVersion:cfg.EDGE_PACKAGED_UPDATE_VERSION,updateTargets:cfg.EDGE_PACKAGED_UPDATE_TARGET_AGENTS,cams,rules,events,alerts},null,2));
}finally{await redis.quit();await db.end();}
