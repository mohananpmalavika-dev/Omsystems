import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),db=new pg.Client({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});redis.on('error',()=>{});
await db.connect();await redis.connect();
const read=async id=>{const raw=await redis.get('analytics:latest-frame:'+id);if(!raw)return null;
 const f=JSON.parse(raw);return {capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,width:f.width,height:f.height};};
try{
 const cameras=(await db.query(`SELECT c.id,c.channel,c.status,c.edge_agent_id,rn.name,bn.name AS branch,
 EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id=c.id AND r.detection_type='helmet-worn' AND r.enabled=true AND (to_jsonb(r)->>'archived_at') IS NULL) AS helmet_rule
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id LEFT JOIN resource_nodes bn ON bn.id=c.branch_node_id
 WHERE rn.is_active=true AND c.branch_node_id<>'00000000-0000-4000-8000-000000000104' ORDER BY bn.name,c.channel`)).rows;
 if(!cameras.length)throw Error('No active branch cameras');
 for(const c of cameras)c.first=await read(c.id);
 await new Promise(r=>setTimeout(r,35000));
 for(const c of cameras){
  c.second=await read(c.id);
  c.advancing=!!c.first&&!!c.second&&Date.parse(c.second.capturedAt)>Date.parse(c.first.capturedAt);
  const response=await fetch(config.ANALYTICS_ENGINE_URL+'/v1/analytics/cameras/'+c.id+'/status',
   {headers:{'x-analytics-source-key':config.ANALYTICS_ENGINE_SHARED_KEY},signal:AbortSignal.timeout(3000)});
  if(response.ok){const a=await response.json();c.analytics={engine:a.aiEngine,stream:a.stream,inference:a.inference,lastDetectionAt:a.detection?.lastDetectionAt};}
  else c.analytics={error:'HTTP '+response.status};
 }
 const notifications=(await db.query(`SELECT n.channel,n.status,count(*)::int AS count,max(n.updated_at) AS latest
 FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id WHERE a.title ILIKE '%helmet%'
 AND a.created_at>now()-interval '24 hours' GROUP BY n.channel,n.status`)).rows;
 const alerts=(await db.query(`SELECT a.camera_id,bn.name AS branch,rn.name AS camera,count(*)::int AS count,max(a.created_at) AS latest
 FROM analytics_alerts a JOIN cameras c ON c.id=a.camera_id JOIN resource_nodes rn ON rn.id=c.resource_node_id
 LEFT JOIN resource_nodes bn ON bn.id=c.branch_node_id WHERE rn.is_active=true AND a.title ILIKE '%helmet%'
 AND a.created_at>now()-interval '24 hours' GROUP BY a.camera_id,bn.name,rn.name ORDER BY latest DESC`)).rows;
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),summary:{activeCameras:cameras.length,
 helmetRules:cameras.filter(c=>c.helmet_rule).length,freshFrames:cameras.filter(c=>c.second&&c.second.ageSeconds<=90).length,
 advancingFrames:cameras.filter(c=>c.advancing).length,analyticsOperational:cameras.filter(c=>c.analytics.engine==='AI_OPERATIONAL').length},
 cameras,notifications,alerts},null,2));
}finally{await redis.quit();await db.end();}
