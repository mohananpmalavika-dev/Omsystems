import { execSync } from 'child_process';

const sql = `
SELECT id, camera_id, detection_type, occurred_at, created_at 
FROM analytics_events 
WHERE detection_type LIKE '%face%'
ORDER BY occurred_at DESC LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${base64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
