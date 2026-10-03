import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Disable helmet-worn rule specifically on Channel 5 (Hajipur Staff area)
UPDATE analytics_rules 
SET enabled = false 
WHERE camera_id = '97280c3c-35f4-4f66-8b98-499b125bf3d2' AND detection_type = 'helmet-worn';

-- 2. Resolve any existing helmet alerts for Channel 5
UPDATE analytics_alerts 
SET status = 'false_alarm' 
WHERE camera_id = '97280c3c-35f4-4f66-8b98-499b125bf3d2' 
  AND title ILIKE '%helmet%'
  AND status IN ('new', 'acknowledged');

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
console.log('Disabling helmet-worn rule on Channel 5...');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `
SELECT r.id, r.name, r.detection_type, r.enabled, c.model as camera_name 
FROM analytics_rules r
JOIN cameras c ON c.id = r.camera_id
WHERE c.ip_address = '172.29.91.100' AND r.detection_type = 'helmet-worn'
ORDER BY c.recorder_channel;
`;
const checkBase64 = Buffer.from(checkSql).toString('base64');
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${checkBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== HELMET RULE STATUS ACROSS HAJIPUR CHANNELS ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));
