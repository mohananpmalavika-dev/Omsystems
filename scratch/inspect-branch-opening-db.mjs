import { execSync } from 'child_process';

const sql = `
SELECT 'nbfc_rule_state' as tbl, count(*) as count FROM nbfc_rule_state WHERE entity_key LIKE 'branch-opening%';
SELECT entity_key, current_status, first_condition_met_at, current_metrics FROM nbfc_rule_state WHERE entity_key LIKE 'branch-opening%' LIMIT 20;

SELECT 'analytics_events' as tbl, count(*) as count FROM analytics_events WHERE detection_type = 'dual-control-verification' OR source_event_id LIKE 'branch-opening%' OR metadata->>'violation' = 'BRANCH_OPENING_MINIMUM_STAFF';
SELECT id, detection_type, occurred_at, source_event_id, metadata FROM analytics_events WHERE detection_type = 'dual-control-verification' OR source_event_id LIKE 'branch-opening%' OR metadata->>'violation' = 'BRANCH_OPENING_MINIMUM_STAFF' LIMIT 10;

SELECT 'analytics_alerts' as tbl, count(*) as count FROM analytics_alerts WHERE detection_type = 'dual-control-verification' OR rule_id IN (SELECT id FROM analytics_rules WHERE detection_type = 'dual-control-verification');
SELECT id, rule_id, detection_type, status, created_at, metadata FROM analytics_alerts WHERE detection_type = 'dual-control-verification' OR rule_id IN (SELECT id FROM analytics_rules WHERE detection_type = 'dual-control-verification') LIMIT 10;

SELECT 'alerts' as tbl, count(*) as count FROM alerts WHERE alert_type = 'dual-control-verification';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

try {
  const output = execSync(cmd, { encoding: 'utf8' });
  console.log(output);
} catch (e) {
  console.error(e.stdout || e.message);
}
