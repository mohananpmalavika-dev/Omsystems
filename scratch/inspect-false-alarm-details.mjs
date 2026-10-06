import { execSync } from 'child_process';

const sql = `
SELECT id, title, rule_id, status, false_alarm_reason, created_at, last_detected_at
FROM analytics_alerts
WHERE status = 'false_alarm'
ORDER BY created_at DESC
LIMIT 15;

SELECT COUNT(*), title, rule_id, false_alarm_reason
FROM analytics_alerts
WHERE status = 'false_alarm'
GROUP BY title, rule_id, false_alarm_reason;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
