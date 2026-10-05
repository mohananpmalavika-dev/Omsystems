import { execSync } from 'child_process';

const sql = `
SELECT DISTINCT detection_type, count(*) 
FROM analytics_events 
WHERE detection_type ILIKE '%person%' OR detection_type ILIKE '%count%' 
GROUP BY detection_type;

SELECT status, count(*) 
FROM analytics_alerts 
WHERE title ILIKE '%person counting%' OR title ILIKE '%people counting%'
GROUP BY status;

SELECT id, title, status, first_detected_at, last_detected_at 
FROM analytics_alerts 
WHERE title ILIKE '%person counting%' 
ORDER BY last_detected_at DESC 
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
