import { execSync } from 'child_process';

const sql = `
SELECT 'analytics_notifications' as tbl, count(*) FROM analytics_notifications WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE status = 'false_alarm')
UNION ALL
SELECT 'analytics_escalations' as tbl, count(*) FROM analytics_escalations WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE status = 'false_alarm')
UNION ALL
SELECT 'analytics_acknowledgements' as tbl, count(*) FROM analytics_acknowledgements WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE status = 'false_alarm');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
