set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try {
 const cameras=(await pool.query(`SELECT c.id,c.recorder_channel,c.channel,cn.name,b.name AS branch_name
   FROM cameras c JOIN resource_nodes cn ON cn.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id
   WHERE b.name ILIKE '%bettaih%' AND (c.recorder_channel=8 OR c.channel=8)`)).rows;
 console.log('CAMERAS',JSON.stringify(cameras));
 for(const camera of cameras) {
  const rules=(await pool.query(`SELECT name,detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds
    FROM analytics_rules WHERE camera_id=$1 ORDER BY detection_type`,[camera.id])).rows;
  console.log('RULES',JSON.stringify(rules));
  const events=(await pool.query(`SELECT detection_type,status,model_version,count(*) AS count,max(occurred_at) AS latest
    FROM analytics_events WHERE camera_id=$1 AND occurred_at>now()-interval '2 hours'
    GROUP BY detection_type,status,model_version ORDER BY detection_type`,[camera.id])).rows;
  console.log('EVENTS',JSON.stringify(events));
  const alerts=(await pool.query(`SELECT status,count(*) AS count,max(created_at) AS latest FROM analytics_alerts
    WHERE camera_id=$1 AND created_at>now()-interval '2 hours' AND title ILIKE '%helmet%' GROUP BY status`,[camera.id])).rows;
  console.log('ALERTS',JSON.stringify(alerts));
  console.log('FRAME_CACHE_TTL_SECONDS',await redis.ttl(`analytics:latest-frame:${camera.id}`));
 }
} finally {await redis.quit();await pool.end();}
JS
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('HEALTH',JSON.stringify({aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,
  notifications:h.notifications,version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
