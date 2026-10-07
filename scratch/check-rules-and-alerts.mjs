import { execSync } from 'child_process';

const sql = `
SELECT detection_type, cooldown_seconds, count(1) 
FROM analytics_rules 
GROUP BY detection_type, cooldown_seconds;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
