import { execSync } from 'child_process';

const script = `
import { createClient } from 'redis';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

try {
  const branchId = '00000000-0000-4000-8000-000000000104';
  const cameras = (await db.query(\`
    SELECT c.id, c.channel, rn.name, c.status, c.last_seen_at
    FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    WHERE c.branch_node_id = $1 AND rn.is_active = true
    ORDER BY c.channel
  \`, [branchId])).rows;

  console.log('--- CAMERAS & LATEST FRAMES IN REDIS ---');
  for (const cam of cameras) {
    const raw = await redis.get('analytics:latest-frame:' + cam.id);
    const ttl = await redis.ttl('analytics:latest-frame:' + cam.id);
    if (raw) {
      const parsed = JSON.parse(raw);
      const frameAge = (Date.now() - new Date(parsed.capturedAt).getTime()) / 1000;
      console.log(\`Camera \${cam.channel} (\${cam.name}, id: \${cam.id}): FRAME PRESENT! capturedAt=\${parsed.capturedAt}, age=\${frameAge.toFixed(1)}s, ttl=\${ttl}s, imageBase64 len=\${parsed.imageBase64?.length || 0}\`);
    } else {
      console.log(\`Camera \${cam.channel} (\${cam.name}, id: \${cam.id}): NO FRAME in redis (ttl=\${ttl})\`);
    }
  }

  console.log('\\n--- RECENT HELMET EVENTS (last 2 hours) ---');
  const events = (await db.query(\`
    SELECT id, camera_id, detection_type, confidence, occurred_at, status, model_version, metadata
    FROM analytics_events
    WHERE detection_type IN ('helmet', 'helmet-worn')
      AND occurred_at > now() - interval '2 hours'
    ORDER BY occurred_at DESC
    LIMIT 10
  \`)).rows;
  console.log(JSON.stringify(events, null, 2));

  console.log('\\n--- RECENT HELMET ALERTS (last 2 hours) ---');
  const alerts = (await db.query(\`
    SELECT id, camera_id, title, confidence, created_at, status, description
    FROM analytics_alerts
    WHERE (title ILIKE '%helmet%' OR description::text ILIKE '%helmet%')
      AND created_at > now() - interval '2 hours'
    ORDER BY created_at DESC
    LIMIT 10
  \`)).rows;
  console.log(JSON.stringify(alerts, null, 2));

} finally {
  await redis.quit();
  await db.end();
}
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
