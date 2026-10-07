import { execSync } from 'child_process';

const sql = `
SELECT a.id, a.title, a.status, a.first_detected_at, a.last_detected_at, a.created_at,
       ROUND(EXTRACT(EPOCH FROM (a.created_at - a.first_detected_at))::numeric, 2) as first_detection_latency_sec,
       ROUND(EXTRACT(EPOCH FROM (NOW() - a.created_at))::numeric, 0) as age_sec
FROM analytics_alerts a 
WHERE a.title ILIKE '%helmet%' 
ORDER BY a.created_at DESC 
LIMIT 10;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
