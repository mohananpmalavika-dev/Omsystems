import { execSync } from 'child_process';

const sql = `
SELECT id, title, status, created_at 
FROM analytics_alerts 
WHERE title ILIKE '%person count%' OR title ILIKE '%people count%'
ORDER BY created_at DESC 
LIMIT 5;

SELECT DISTINCT detection_type, suppressed, label 
FROM alert_suppression_config 
ORDER BY detection_type;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
