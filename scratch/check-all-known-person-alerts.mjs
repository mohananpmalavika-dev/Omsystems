import { execSync } from 'child_process';

const sql = `
SELECT id, title, status, first_detected_at, last_detected_at, resolved_at 
FROM analytics_alerts 
WHERE title ILIKE '%known person%'
ORDER BY first_detected_at DESC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${base64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
