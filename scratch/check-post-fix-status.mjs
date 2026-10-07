import { execSync } from 'child_process';

const sql = `
SELECT count(*) as recent_helmet_alerts
FROM analytics_alerts 
WHERE title ILIKE '%helmet%' AND created_at >= NOW() - interval '5 minutes';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
