import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Deactivate person and person counting rules
UPDATE analytics_rules 
SET enabled = false 
WHERE detection_type IN ('person', 'person-counting', 'occupancy-counting');

-- 2. Resolve active alerts for person and person counting
UPDATE analytics_alerts 
SET status = 'resolved' 
WHERE (title ILIKE '%person%' OR title ILIKE '%counting%') 
  AND status IN ('new', 'acknowledged');

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
console.log('Deactivating person and person counting rules in GCP database...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `SELECT detection_type, enabled, count(*) FROM analytics_rules WHERE detection_type IN ('person', 'person-counting', 'occupancy-counting', 'face-recognition') GROUP BY detection_type, enabled ORDER BY detection_type;`;
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${checkSql}\\""`;
console.log('=== VERIFICATION: RULE STATUS ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));

const alertSql = `SELECT count(*) as open_alerts FROM analytics_alerts WHERE (title ILIKE '%person%' OR title ILIKE '%counting%') AND status IN ('new', 'acknowledged');`;
const alertCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${alertSql}\\""`;
console.log('=== VERIFICATION: REMAINING OPEN ALERTS ===');
console.log(execSync(alertCmd, { encoding: 'utf8' }));
