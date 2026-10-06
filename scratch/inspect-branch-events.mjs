import { execSync } from 'child_process';

const sql = `
SELECT id, camera_id, detection_type, occurred_at, source_event_id, metadata->>'violation' as violation, metadata->>'branchId' as branch_id, metadata->>'staffCount' as staff_count
FROM analytics_events 
WHERE detection_type = 'dual-control-verification' OR source_event_id LIKE 'branch-opening%' OR metadata->>'violation' = 'BRANCH_OPENING_MINIMUM_STAFF';

SELECT rule_id, entity_key, current_status, first_condition_met_at, current_metrics->>'branchId' as branch_id, current_metrics->>'localDate' as local_date, current_metrics->>'outcome' as outcome, current_metrics->>'personCount' as person_count
FROM nbfc_rule_state
WHERE entity_key LIKE 'branch-opening%';

SELECT count(*) FROM incidents WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE rule_id IN (SELECT id FROM analytics_rules WHERE detection_type = 'dual-control-verification'));
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
