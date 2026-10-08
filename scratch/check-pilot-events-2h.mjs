import { execSync } from 'child_process';

const script = `
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const pilotCamIds = [
  '0f545b49-8d4c-4999-83ab-567fc9e3309c', // Ch 2
  'e51113dd-d8c7-4d8b-8df9-267edeae7c94', // Ch 6
  '43c562cd-2006-443d-bbc1-8a53da835efb', // Ch 7
  'd2e27fc9-8bd2-4184-8397-7581ac3ffeda', // Ch 8
  'e66e3498-1c13-4f59-91d7-5a3386d269d2', // Ch 9
  'b9600908-db55-4fb8-8b4f-deb0b2c9d254'  // Ch 11
];

const res = await db.query(\`
  SELECT id, camera_id, detection_type, confidence, occurred_at, status
  FROM analytics_events
  WHERE camera_id = ANY($1)
    AND occurred_at > now() - interval '2 hours'
  ORDER BY occurred_at DESC
  LIMIT 50;
\`, [pilotCamIds]);

console.log('Total events in last 2 hours on pilot cameras:', res.rows.length);
console.log(res.rows);

await db.end();
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
