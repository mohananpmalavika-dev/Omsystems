import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Disable all 'person' detection rules in analytics_rules
UPDATE analytics_rules
SET enabled = false, updated_at = NOW()
WHERE detection_type = 'person';

-- 2. Add global tenant suppression for 'person' in alert_suppression_config
INSERT INTO alert_suppression_config (tenant_id, detection_type, suppressed, label, updated_by)
SELECT id, 'person', true, 'Person Detection', 'user'
FROM tenants
ON CONFLICT (tenant_id, branch_id, camera_id, detection_type)
DO UPDATE SET suppressed = true, updated_at = NOW();

-- 3. Resolve all active 'Person detected' alerts
UPDATE analytics_alerts
SET status = 'resolved',
    resolved_at = NOW(),
    updated_at = NOW()
WHERE (title = 'Person detected' OR title ILIKE '%person detected%' OR detection_signature->>'detectionType' = 'person')
  AND status IN ('new', 'acknowledged', 'investigating');

COMMIT;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== APPLYING CHANGES TO STOP PERSON DETECTED ALERTS ===');
console.log(execSync(cmd, { encoding: 'utf8' }));

// Verification
const checkSql = `
SELECT detection_type, enabled, count(*)
FROM analytics_rules
WHERE detection_type = 'person'
GROUP BY detection_type, enabled;

SELECT tenant_id, detection_type, suppressed, label
FROM alert_suppression_config
WHERE detection_type IN ('person', 'occupancy-counting');

SELECT status, count(*)
FROM analytics_alerts
WHERE title = 'Person detected' OR title ILIKE '%person detected%' OR detection_signature->>'detectionType' = 'person'
GROUP BY status;
`;

const checkBase64 = Buffer.from(checkSql).toString('base64');
const checkCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${checkBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('=== VERIFICATION RESULT ===');
console.log(execSync(checkCmd, { encoding: 'utf8' }));
