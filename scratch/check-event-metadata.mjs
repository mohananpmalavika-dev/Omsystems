import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ev = await db.query(\`
  SELECT id, detection_type, confidence, 
         metadata - 'snapshotBase64' - 'annotatedSnapshotBase64' as clean_meta, 
         status, occurred_at
  FROM analytics_events
  WHERE camera_id = 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda'
    AND occurred_at > now() - interval '30 minutes'
  ORDER BY occurred_at DESC;
\`);

console.log(JSON.stringify(ev.rows, null, 2));

await db.end();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
