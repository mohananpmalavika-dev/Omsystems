import { execSync } from 'child_process';

const sql = `
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'analytics_alerts';

SELECT 
  id, title, severity, camera_id, created_at
FROM analytics_alerts
ORDER BY created_at DESC
LIMIT 10;

SELECT 
  rule_id, entity_key, current_status, alert_count, last_evaluated_at
FROM nbfc_rule_state
ORDER BY last_evaluated_at DESC
LIMIT 10;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
