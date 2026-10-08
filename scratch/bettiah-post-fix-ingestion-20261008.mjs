import pg from 'pg';import {createClient} from 'redis';import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),db=new pg.Client({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});redis.on('error',()=>{});await db.connect();await redis.connect();
try{
 const agents=(await db.query(`SELECT e.id,e.name,e.status,e.version,e.last_seen_at,bn.name AS branch FROM edge_agents e
 LEFT JOIN resource_nodes bn ON bn.id=e.branch_node_id ORDER BY e.last_seen_at DESC`)).rows;
 const commands=(await db.query(`SELECT id,edge_agent_id,command_type,status,requested_at,completed_at FROM edge_commands
 WHERE requested_at>now()-interval '1 hour' ORDER BY requested_at DESC LIMIT 10`)).rows;
 const keys=await redis.keys('analytics:latest-frame:*');const frames=[];
 for(const key of keys){const raw=await redis.get(key);if(raw){const f=JSON.parse(raw);frames.push({cameraId:key.slice('analytics:latest-frame:'.length),capturedAt:f.capturedAt,ageSeconds:(Date.now()-Date.parse(f.capturedAt))/1000,ttl:await redis.ttl(key)});}}
 const info=await redis.info('server');const requests=await redis.keys('analytics:*frame*');
 const response=await fetch(config.ANALYTICS_ENGINE_URL+'/health');const health=await response.json();
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),agents,commands,frames,frameKeys:requests,
 redisUptimeSeconds:Number(info.match(/uptime_in_seconds:(\d+)/)?.[1]),engine:{received:health.received,accepted:health.accepted,failed:health.failed,lastAcceptedAt:health.lastAcceptedAt,
 scheduler:health.pipeline?.metrics?.scheduler??health.pipeline?.scheduler,helmet:health.pipeline?.detectors?.helmet}},null,2));
}finally{await redis.quit();await db.end();}
