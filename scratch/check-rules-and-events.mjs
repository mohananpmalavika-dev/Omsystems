import { execSync } from 'child_process';

const sql = `
SELECT detection_type, enabled, count(*) 
FROM analytics_rules 
GROUP BY detection_type, enabled 
ORDER BY detection_type, enabled;

SELECT count(*) as total_enabled_rules FROM analytics_rules WHERE enabled = true;

SELECT id, name, detection_type, enabled, camera_id 
FROM analytics_rules 
WHERE detection_type ILIKE '%helmet%' OR detection_type ILIKE '%person%' OR enabled = true
LIMIT 20;

SELECT count(*) as recent_events_count FROM analytics_events WHERE occurred_at > NOW() - INTERVAL '1 hour';

SELECT id, event_type, camera_id, confidence, occurred_at 
FROM analytics_events 
ORDER BY occurred_at DESC 
LIMIT 10;

SELECT id, title, severity, status, triggered_at 
FROM analytics_alerts 
ORDER BY triggered_at DESC 
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
