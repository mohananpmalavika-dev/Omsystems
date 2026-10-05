import { execSync } from 'child_process';

const sql = `
SELECT r.detection_type, r.enabled, count(*) 
FROM analytics_rules r 
WHERE r.detection_type IN ('helmet-worn', 'object') 
GROUP BY r.detection_type, r.enabled;

SELECT c.name, c.branch_name, r.detection_type, r.enabled
FROM analytics_rules r
JOIN cameras c ON c.id = r.camera_id
WHERE r.detection_type = 'helmet-worn'
LIMIT 20;

SELECT count(*) as open_helmet_alerts
FROM analytics_alerts
WHERE title ILIKE '%helmet%' AND status IN ('new', 'acknowledged');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
