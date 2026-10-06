set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import fs from 'node:fs';
import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try {
 const cameras=(await pool.query(`SELECT c.id,c.recorder_channel,c.channel,c.edge_agent_id,cn.name,b.name AS branch_name
 FROM cameras c JOIN resource_nodes cn ON cn.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id
 WHERE b.name ILIKE '%kollam%' AND (c.recorder_channel=8 OR c.channel=8)`)).rows;
 console.log('CAMERAS',JSON.stringify(cameras));
 for(const camera of cameras) {
  const rules=(await pool.query(`SELECT id,name,detection_type,enabled,min_confidence,min_duration_seconds,cooldown_seconds,schedule
    FROM analytics_rules WHERE camera_id=$1 ORDER BY detection_type`,[camera.id])).rows;
  console.log('RULES',JSON.stringify(rules));
  const events=(await pool.query(`SELECT id,detection_type,occurred_at,confidence,model_version FROM analytics_events
    WHERE camera_id=$1 AND occurred_at>now()-interval '2 hours' ORDER BY occurred_at DESC LIMIT 20`,[camera.id])).rows;
  console.log('EVENTS',JSON.stringify(events));
  const alerts=(await pool.query(`SELECT id,title,status,created_at FROM analytics_alerts WHERE camera_id=$1
    AND created_at>now()-interval '2 hours' ORDER BY created_at DESC LIMIT 15`,[camera.id])).rows;
  console.log('ALERTS',JSON.stringify(alerts));
  const raw=await redis.get(`analytics:latest-frame:${camera.id}`);
  if(raw) {
   const frame=JSON.parse(raw);
   console.log('FRAME',JSON.stringify({cameraId:camera.id,capturedAt:frame.capturedAt,bytes:Buffer.from(frame.imageBase64,'base64').length}));
   fs.writeFileSync('/tmp/kollam-channel8-helmet-frame.json',JSON.stringify({...frame,cameraId:camera.id}),{mode:0o600});
  }
 }
} finally {await redis.quit();await pool.end();}
JS
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const code=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log('HEALTH',JSON.stringify({aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,version:code.match(/super\("helmet", "([^"]+)"\)/)?.[1]}));
JS
