import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Disable all face-recognition rules
UPDATE analytics_rules 
SET enabled = false 
WHERE detection_type = 'face-recognition';

-- 2. Resolve all active Known person recognised alerts
UPDATE analytics_alerts 
SET status = 'resolved' 
WHERE title ILIKE '%known person%'
  AND status IN ('new', 'acknowledged');

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
console.log('Stopping Known Person Recognised alerts and disabling face-recognition rules...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `
SELECT detection_type, enabled, count(*) 
FROM analytics_rules 
WHERE detection_type = 'face-recognition' 
GROUP BY detection_type, enabled;

SELECT status, count(*) 
FROM analytics_alerts 
WHERE title ILIKE '%known person%' 
GROUP BY status;
`;
const checkBase64 = Buffer.from(checkSql).toString('base64');
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${checkBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFICATION ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));
