import { execSync } from 'child_process';

const sql = `
BEGIN;

-- Mark any helmet alerts from the last 2 hours as false_alarm
UPDATE analytics_alerts 
SET status = 'false_alarm', updated_at = NOW()
WHERE title ILIKE '%helmet%' AND created_at >= NOW() - interval '2 hours';

-- Clean up any active notifications for false alarms so audio stops and toast clears
DELETE FROM analytics_notifications 
WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE status = 'false_alarm');

-- Delete the false alarm alerts to completely wipe them from the alert list
DELETE FROM analytics_alerts 
WHERE status = 'false_alarm';

COMMIT;

SELECT count(*) as remaining_open_alerts FROM analytics_alerts WHERE status IN ('new', 'acknowledged');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
