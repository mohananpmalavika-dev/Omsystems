import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';
import {createClient} from 'redis';
import {loadConfig} from '/app/dist/src/config.js';
const config=loadConfig(),pool=new pg.Pool({connectionString:config.DATABASE_URL});
const redis=createClient({url:config.REDIS_URL});await redis.connect();
try {
  const cameras = (await pool.query(\`
    SELECT c.id, c.recorder_channel, c.channel, cn.name as camera_name, b.name as branch_name, c.edge_agent_id
    FROM cameras c
    JOIN resource_nodes cn ON cn.id = c.resource_node_id
    LEFT JOIN resource_nodes b ON b.id = c.branch_node_id
    WHERE c.recorder_channel = 8 OR c.channel = 8 OR cn.name ILIKE '%Channel 8%' OR cn.name ILIKE '%Pilot%'
  \`)).rows;
  console.log('CAMERAS_FOUND:', JSON.stringify(cameras, null, 2));

  for (const cam of cameras) {
    const rules = (await pool.query(\`
      SELECT id, name, detection_type, enabled, min_confidence, min_duration_seconds
      FROM analytics_rules
      WHERE camera_id = $1
    \`, [cam.id])).rows;
    console.log(\`RULES for \${cam.camera_name} (\${cam.id}):\`, JSON.stringify(rules.map(r => ({name: r.name, type: r.detection_type, enabled: r.enabled}))));

    const events = (await pool.query(\`
      SELECT id, detection_type, occurred_at, confidence, metadata
      FROM analytics_events
      WHERE camera_id = $1 AND occurred_at > now() - interval '60 minutes'
      ORDER BY occurred_at DESC LIMIT 10
    \`, [cam.id])).rows;
    console.log(\`RECENT_EVENTS for \${cam.camera_name}:\`, JSON.stringify(events));

    const alerts = (await pool.query(\`
      SELECT id, title, severity, status, created_at, confidence
      FROM analytics_alerts
      WHERE camera_id = $1 AND created_at > now() - interval '60 minutes'
      ORDER BY created_at DESC LIMIT 10
    \`, [cam.id])).rows;
    console.log(\`RECENT_ALERTS for \${cam.camera_name}:\`, JSON.stringify(alerts));

    const raw = await redis.get(\`analytics:latest-frame:\${cam.id}\`);
    console.log(\`LATEST_FRAME in redis for \${cam.camera_name}:\`, raw ? 'EXISTS (' + raw.length + ' chars)' : 'NULL');
  }
} finally {
  await redis.quit();
  await pool.end();
}
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
