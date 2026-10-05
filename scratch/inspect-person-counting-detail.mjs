import { execSync } from 'child_process';

const sql = `
SELECT id, title, detection_signature, status, rule_id, created_at 
FROM analytics_alerts 
WHERE title ILIKE '%person counting%' 
ORDER BY created_at DESC 
LIMIT 5;

SELECT id, name, detection_type, enabled, branch_id, camera_id 
FROM analytics_rules 
WHERE detection_type IN ('person-counting', 'footfall') OR name ILIKE '%person count%' OR name ILIKE '%counting%';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'alert_suppression_config';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
