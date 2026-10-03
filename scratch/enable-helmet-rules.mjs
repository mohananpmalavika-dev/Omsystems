import { execSync } from 'child_process';

const sql = `
BEGIN;

-- Re-enable helmet-worn rules
UPDATE analytics_rules 
SET enabled = true 
WHERE detection_type = 'helmet-worn';

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
console.log('Re-enabling helmet-worn alert rules...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `SELECT detection_type, enabled, count(*) FROM analytics_rules WHERE detection_type = 'helmet-worn' GROUP BY detection_type, enabled;`;
const checkBase64 = Buffer.from(checkSql).toString('base64');
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${checkBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFICATION: HELMET-WORN RULE STATUS ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));
