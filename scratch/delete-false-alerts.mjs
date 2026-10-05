import { execSync } from 'child_process';

const sql = `
BEGIN;

-- Delete referencing rows in analytics_notifications
DELETE FROM analytics_notifications 
WHERE alert_id IN (SELECT id FROM analytics_alerts WHERE status = 'false_alarm');

-- Delete the false alarm alerts
DELETE FROM analytics_alerts 
WHERE status = 'false_alarm';

COMMIT;

-- Verify remaining alerts and status counts
SELECT status, count(*) 
FROM analytics_alerts 
GROUP BY status;
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
