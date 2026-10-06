import { execSync } from 'child_process';

const sql = `
BEGIN;

-- Delete child records referencing analytics_alerts
DELETE FROM analytics_notifications WHERE alert_id IS NOT NULL;
DELETE FROM analytics_escalations WHERE alert_id IS NOT NULL;
DELETE FROM analytics_acknowledgements WHERE alert_id IS NOT NULL;

-- Delete all AI alerts
DELETE FROM analytics_alerts;
DELETE FROM alerts;

COMMIT;

-- Verification
SELECT 'analytics_alerts' AS table_name, count(*) FROM analytics_alerts
UNION ALL
SELECT 'analytics_notifications', count(*) FROM analytics_notifications
UNION ALL
SELECT 'analytics_escalations', count(*) FROM analytics_escalations
UNION ALL
SELECT 'analytics_acknowledgements', count(*) FROM analytics_acknowledgements
UNION ALL
SELECT 'alerts', count(*) FROM alerts;
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
