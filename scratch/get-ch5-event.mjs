import { execSync } from 'child_process';

const sql = `SELECT metadata::text FROM analytics_events WHERE id = 'd06bfc8a-5299-4df0-b767-4bcce4545c6d';`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`;
const raw = execSync(cmd, { encoding: 'utf8' }).trim();
const parsed = JSON.parse(raw);
console.log('Keys:', Object.keys(parsed));
console.log('Objects:', JSON.stringify(parsed.objects));
console.log('Execution:', JSON.stringify(parsed.executionMetadata));
console.log('Raw:', JSON.stringify(parsed).slice(0, 500));
