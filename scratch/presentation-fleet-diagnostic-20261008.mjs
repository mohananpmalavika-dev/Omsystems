import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),db=new pg.Client({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});redis.on('error',()=>{});
await db.connect();await redis.connect();
const queries={
 agents:`SELECT id,name,status,version,last_seen_at,branch_node_id FROM edge_agents ORDER BY last_seen_at DESC`,
 notifications:`SELECT n.channel,n.status,count(*)::int AS count,max(n.updated_at) AS last_updated
 FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id
 WHERE a.title ILIKE '%helmet%' AND a.created_at>now()-interval '24 hours' GROUP BY n.channel,n.status`,
 notificationFailures:`SELECT n.channel,n.status,n.attempts,n.last_error,n.updated_at,a.camera_id,a.title
 FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id
 WHERE a.title ILIKE '%helmet%' AND n.status NOT IN ('delivered','cancelled')
 AND a.created_at>now()-interval '24 hours' ORDER BY n.updated_at DESC LIMIT 10`,
 commands:`SELECT id,edge_agent_id,command_type,status,requested_at,completed_at
 FROM edge_commands WHERE requested_at>now()-interval '24 hours' ORDER BY requested_at DESC LIMIT 15`,
 schema:`SELECT table_name,column_name FROM information_schema.columns
 WHERE table_name IN ('analytics_notifications','edge_agents','camera_discoveries') ORDER BY table_name,ordinal_position`,
};
try{
 const cameras=(await db.query(`SELECT c.id,c.channel,c.recorder_channel,c.status,c.last_seen_at,c.edge_agent_id,
 c.branch_node_id,bn.name AS branch,rn.name AS name,
 c.connection_secret_ref IS NOT NULL AS has_stream_secret,
 e.status AS agent_status,e.version AS agent_version,e.last_seen_at AS agent_last_seen
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id
 LEFT JOIN resource_nodes bn ON bn.id=c.branch_node_id LEFT JOIN edge_agents e ON e.id=c.edge_agent_id
 WHERE rn.is_active=true ORDER BY bn.name,c.channel`)).rows;
 for(const c of cameras){const raw=await redis.get('analytics:latest-frame:'+c.id);
  if(raw){const f=JSON.parse(raw);c.frame={capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,width:f.width,height:f.height,encoding:f.imageEncoding};}
  else c.frame=null;
 }
 const report={checkedAt:new Date().toISOString(),hdCapture:config.HELMET_HD_CAPTURE_CAMERAS,
 updateVersion:config.EDGE_PACKAGED_UPDATE_VERSION,updateTargets:config.EDGE_PACKAGED_UPDATE_TARGET_AGENTS,cameras};
 for(const [key,sql] of Object.entries(queries)){try{report[key]=(await db.query(sql)).rows;}catch(e){report[key]={error:e.message};}}
 report.pilotEntries=(await db.query(`SELECT c.id,c.channel,c.edge_agent_id,rn.name,rn.is_active,c.status
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id
 WHERE c.branch_node_id='00000000-0000-4000-8000-000000000104' ORDER BY c.channel`)).rows;
 report.recentEvents=(await db.query(`SELECT camera_id,detection_type,count(*)::int AS count,max(occurred_at) AS latest
 FROM analytics_events WHERE occurred_at>now()-interval '2 hours' GROUP BY camera_id,detection_type ORDER BY latest DESC`)).rows;
 delete report.schema;
 console.log(JSON.stringify(report,null,2));
}finally{await redis.quit();await db.end();}
