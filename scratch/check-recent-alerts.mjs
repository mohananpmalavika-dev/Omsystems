import { execSync } from 'child_process';

const sql = `
SELECT id, title, severity, threat_type, detected_at, metadata
FROM threat_alerts
ORDER BY detected_at DESC
LIMIT 5;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
