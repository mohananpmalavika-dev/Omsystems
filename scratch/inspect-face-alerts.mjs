import { execSync } from 'child_process';

const sql = `
SELECT id, first_detected_at, camera_id, status, severity, title 
FROM analytics_alerts 
ORDER BY first_detected_at DESC LIMIT 20;

SELECT id, name, detection_type, enabled, camera_id 
FROM analytics_rules 
WHERE detection_type LIKE '%face%' OR detection_type LIKE '%person%' OR title_pattern LIKE '%person%' OR name ILIKE '%face%' OR name ILIKE '%person%';
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
