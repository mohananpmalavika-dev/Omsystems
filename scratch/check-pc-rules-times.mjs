import { execSync } from 'child_process';

const sql = `
SELECT id, name, detection_type, enabled, created_at, updated_at
FROM analytics_rules 
WHERE detection_type = 'person-counting'
ORDER BY updated_at DESC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
