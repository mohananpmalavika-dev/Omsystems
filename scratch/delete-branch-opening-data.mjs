import { execSync } from 'child_process';

const sql = `
BEGIN;

-- Delete branch opening violation events
DELETE FROM analytics_events 
WHERE detection_type = 'dual-control-verification' 
   OR source_event_id LIKE 'branch-opening:%' 
   OR metadata->>'violation' = 'BRANCH_OPENING_MINIMUM_STAFF';

-- Delete branch opening daily evaluation state records
DELETE FROM nbfc_rule_state 
WHERE entity_key LIKE 'branch-opening-day:%';

COMMIT;

-- Verification
SELECT 'nbfc_rule_state' AS tbl, count(*) AS count 
FROM nbfc_rule_state 
WHERE entity_key LIKE 'branch-opening%';

SELECT 'analytics_events' AS tbl, count(*) AS count 
FROM analytics_events 
WHERE detection_type = 'dual-control-verification' 
   OR source_event_id LIKE 'branch-opening:%' 
   OR metadata->>'violation' = 'BRANCH_OPENING_MINIMUM_STAFF';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

try {
  const output = execSync(cmd, { encoding: 'utf8' });
  console.log(output);
} catch (e) {
  console.error(e.stdout || e.message);
  process.exit(1);
}
