import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const camId = 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda'; // Channel 8
const res = await db.query(\`
  SELECT ar.id, ar.name, ar.detection_type, ar.enabled, ar.camera_id, ar.min_confidence, ar.schedule, ar.object_classes
  FROM analytics_rules ar
  WHERE ar.camera_id = $1;
\`, [camId]);

console.log('Rules for Channel 8 (', camId, '):', res.rows);

await db.end();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
