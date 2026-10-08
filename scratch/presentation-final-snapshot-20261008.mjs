import pg from 'pg';import {createClient} from 'redis';import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),db=new pg.Client({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});redis.on('error',()=>{});
await db.connect();await redis.connect();
try{
 const cameras=(await db.query(`SELECT c.id,c.channel,c.status,bn.name AS branch,rn.name,
 EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id=c.id AND r.detection_type='helmet-worn' AND r.enabled AND (to_jsonb(r)->>'archived_at') IS NULL) AS helmet_rule
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id LEFT JOIN resource_nodes bn ON bn.id=c.branch_node_id
 WHERE rn.is_active AND c.branch_node_id<>'00000000-0000-4000-8000-000000000104' ORDER BY bn.name,c.channel`)).rows;
 for(const c of cameras){const raw=await redis.get('analytics:latest-frame:'+c.id);if(raw){const f=JSON.parse(raw);
  c.frame={capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,width:f.width,height:f.height};}else c.frame=null;}
 const notificationDelivery=(await db.query(`SELECT n.channel,n.status,count(*)::int AS count,max(n.updated_at) AS latest
 FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id WHERE a.title ILIKE '%helmet%'
 AND a.created_at>now()-interval '24 hours' GROUP BY n.channel,n.status`)).rows;
 const bettiahAlerts=(await db.query(`SELECT a.id,a.title,a.created_at,to_jsonb(a)->>'event_id' AS event_id,
 to_jsonb(a)->>'rule_id' AS rule_id FROM analytics_alerts a WHERE a.camera_id='d02f79e9-0615-4df6-a604-d3e4b8bde9b2'
 AND a.created_at>now()-interval '3 hours' ORDER BY a.created_at DESC LIMIT 5`)).rows;
 const bettiahEvents=(await db.query(`SELECT id,occurred_at,detection_type,metadata->>'ruleId' AS rule_id,
 metadata->>'rule_id' AS rule_id_snake,metadata->>'source' AS source,metadata->>'provenance' AS provenance
 FROM analytics_events WHERE camera_id='d02f79e9-0615-4df6-a604-d3e4b8bde9b2' AND detection_type='helmet-worn'
 AND occurred_at>now()-interval '3 hours' ORDER BY occurred_at DESC LIMIT 5`)).rows;
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),summary:{activeCameras:cameras.length,
 helmetRules:cameras.filter(c=>c.helmet_rule).length,freshFrames:cameras.filter(c=>c.frame&&c.frame.ageSeconds<=90).length},
 cameras,notificationDelivery,bettiahAlerts,bettiahEvents},null,2));
}finally{await redis.quit();await db.end();}
