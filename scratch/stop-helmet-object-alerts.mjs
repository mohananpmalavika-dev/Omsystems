import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Deactivate helmet-worn and object rules (which caused the false alarms on chairs/desks)
UPDATE analytics_rules 
SET enabled = false 
WHERE detection_type IN ('helmet-worn', 'object');

-- 2. Mark existing helmet and object alerts as resolved / false alarm
UPDATE analytics_alerts 
SET status = 'false_alarm' 
WHERE title ILIKE '%helmet%' OR title ILIKE '%object%'
  AND status IN ('new', 'acknowledged');

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
console.log('Disabling helmet-worn and object alert rules...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `SELECT detection_type, enabled, count(*) FROM analytics_rules WHERE detection_type IN ('helmet-worn', 'object') GROUP BY detection_type, enabled;`;
const checkBase64 = Buffer.from(checkSql).toString('base64');
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${checkBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFICATION: RULE STATUS ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));

const alertSql = `SELECT count(*) as remaining_open FROM analytics_alerts WHERE (title ILIKE '%helmet%' OR title ILIKE '%object%') AND status IN ('new', 'acknowledged');`;
const alertBase64 = Buffer.from(alertSql).toString('base64');
const alertCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${alertBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFICATION: REMAINING OPEN ALERTS ===');
console.log(execSync(alertCmd, { encoding: 'utf8' }));
