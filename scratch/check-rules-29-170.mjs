import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const res = await db.query(\`
  SELECT ar.id, ar.name, ar.detection_type, ar.enabled, c.ip_address, c.channel, ar.min_confidence
  FROM analytics_rules ar
  JOIN cameras c ON ar.camera_id = c.id
  WHERE c.ip_address = '192.168.29.170';
\`);

console.log('Total rules for 192.168.29.170:', res.rows.length);
console.log(res.rows.filter(r => r.detection_type.includes('helmet')));

await db.end();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
