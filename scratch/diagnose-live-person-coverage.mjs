import pg from 'pg';
import {createClient} from 'redis';
import {activeCamera} from '/app/dist/src/database/active-resource.js';
import {loadConfig} from '/app/dist/src/config.js';
const config = loadConfig();
const pool = new pg.Pool({connectionString:config.DATABASE_URL});
const redis = createClient({url:config.REDIS_URL});
await redis.connect();
try {
  const cameras = (await pool.query(`SELECT c.id,cn.name,c.status,c.last_seen_at,c.branch_node_id,c.edge_agent_id,c.ip_address,c.recorder_channel,
    c.connection_secret_ref,s.edge_agent_id AS secret_agent_id,r.name AS branch_name
    FROM cameras c JOIN resource_nodes r ON r.id=c.branch_node_id JOIN resource_nodes cn ON cn.id=c.resource_node_id
    LEFT JOIN central_stream_secrets s ON s.reference=c.connection_secret_ref
    WHERE r.name ILIKE ANY(ARRAY['%hajipur%','%perav%','%bett%','%rajkot%']) AND ${activeCamera('c')} ORDER BY r.name,cn.name`)).rows;
  for (const camera of cameras) {
    const frame = await redis.get(`analytics:latest-frame:${camera.id}`);
    const countKeys = await redis.keys(`analytics:person-count:*:${camera.id}`);
    const counts = await Promise.all(countKeys.map(k=>redis.get(k)));
    const parsedFrame = frame ? JSON.parse(frame) : null;
    console.log(JSON.stringify({...camera,frameAgeSeconds:parsedFrame ? Math.round((Date.now()-Date.parse(parsedFrame.capturedAt))/1000) : null,
      counts:counts.map(v=>v?JSON.parse(v):null)}));
  }
  console.log('AGENTS',JSON.stringify((await pool.query(`SELECT id,name,version,status,last_seen_at,branch_node_id FROM edge_agents
    WHERE branch_node_id IN (SELECT id FROM resource_nodes WHERE name ILIKE ANY(ARRAY['%hajipur%','%perav%','%bett%','%rajkot%']))`)).rows));
  console.log('ASSIGNMENTS',JSON.stringify((await pool.query(`SELECT edge_agent_id,branch_node_id FROM edge_agent_branch_assignments`)).rows));
  console.log('REDIS_FRAME_KEYS', (await redis.keys('analytics:latest-frame:*')).length);
} finally {await redis.quit();await pool.end();}
