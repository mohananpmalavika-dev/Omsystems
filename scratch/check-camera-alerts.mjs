import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid << 'SQL'
UPDATE analytics_alerts SET status = 'new', updated_at = now() WHERE id IN ('5e74f29c-5640-425b-8b63-54259d8cc139', '95608dce-862e-45a2-8d1f-cc1ba1a38fd0');
SELECT id, camera_id, title, status, severity, created_at, updated_at FROM analytics_alerts WHERE title ILIKE '%helmet%' ORDER BY created_at DESC LIMIT 5;
SQL
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
