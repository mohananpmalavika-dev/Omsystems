import { execSync } from 'child_process';

const sql = `
SELECT detection_type, enabled, count(*) 
FROM analytics_rules 
WHERE detection_type IN ('face-recognition', 'face', 'face-detection', 'unknown-person', 'person')
GROUP BY detection_type, enabled 
ORDER BY detection_type, enabled;

SELECT status, count(*) 
FROM analytics_alerts 
WHERE title ILIKE '%known person%' 
GROUP BY status;
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
