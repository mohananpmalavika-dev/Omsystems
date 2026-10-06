import {loadConfig} from '/app/dist/src/config.js';
import pg from 'pg';
import {createClient} from 'redis';
const config=loadConfig();
const pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try {
 console.log('NOW',new Date().toISOString());
 console.log('DB', (await pool.query('SELECT current_database() AS name,now()')).rows);
 console.log('AGENTS',JSON.stringify((await pool.query(`SELECT id,name,hostname,version,status,last_seen_at,branch_node_id FROM edge_agents ORDER BY last_seen_at DESC NULLS LAST LIMIT 12`)).rows));
 for(const key of await redis.keys('analytics:latest-frame:*')) {
  const id=key.split(':').at(-1);const raw=JSON.parse(await redis.get(key));
  const camera=(await pool.query(`SELECT c.id,c.branch_node_id,r.name,c.edge_agent_id FROM cameras c JOIN resource_nodes r ON r.id=c.branch_node_id WHERE c.id=$1`,[id])).rows[0];
  console.log('FRAME',JSON.stringify({id,camera,ageSeconds:Math.round((Date.now()-Date.parse(raw.capturedAt))/1000)}));
 }
 const url=new URL(config.DATABASE_URL);const rurl=new URL(config.REDIS_URL);
 console.log('ENDPOINTS',JSON.stringify({dbHost:url.hostname,dbName:url.pathname,redisHost:rurl.hostname,redisDb:rurl.pathname,fileDb:!!process.env.DATABASE_URL_FILE,fileRedis:!!process.env.REDIS_URL_FILE}));
} finally {await pool.end();await redis.quit();}
