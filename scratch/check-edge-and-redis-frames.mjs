import { execSync } from 'child_process';

const script = `
import { createClient } from 'redis';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

try {
  console.log('--- EDGE AGENTS ---');
  const agents = (await db.query(\`
    SELECT id, name, status, last_seen_at
    FROM edge_agents
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 10
  \`)).rows;
  console.log(JSON.stringify(agents, null, 2));

  console.log('\\n--- ALL KEYS IN REDIS MATCHING analytics:latest-frame:* ---');
  const keys = await redis.keys('analytics:latest-frame:*');
  console.log('Count of latest-frame keys:', keys.length);
  for (const key of keys.slice(0, 20)) {
    const ttl = await redis.ttl(key);
    const raw = await redis.get(key);
    const parsed = raw ? JSON.parse(raw) : null;
    console.log(\`Key: \${key}, TTL: \${ttl}, capturedAt: \${parsed?.capturedAt}\`);
  }

  console.log('\\n--- TOTAL REDIS KEYS ---');
  const allKeys = await redis.keys('*');
  console.log('Total redis keys:', allKeys.length);
  const prefixes = {};
  for (const k of allKeys) {
    const prefix = k.split(':')[0];
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }
  console.log('Prefix breakdown:', JSON.stringify(prefixes, null, 2));

} finally {
  await redis.quit();
  await db.end();
}
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
