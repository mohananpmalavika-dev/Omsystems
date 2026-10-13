import { execSync } from "node:child_process";

const sql = `
BEGIN;

-- Identify the 15 oldest false alerts for PERAVARUNI branch
CREATE TEMP TABLE alerts_to_delete AS
SELECT a.id
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
  AND a.status = 'false_alarm'
ORDER BY a.created_at ASC
LIMIT 15;

-- Show the IDs being deleted
SELECT id FROM alerts_to_delete;

-- Delete referencing rows in analytics_notifications
DELETE FROM analytics_notifications
WHERE alert_id IN (SELECT id FROM alerts_to_delete);

-- Delete from analytics_alerts
DELETE FROM analytics_alerts
WHERE id IN (SELECT id FROM alerts_to_delete);

COMMIT;

-- Verification: remaining alerts breakdown for PERAVARUNI branch
SELECT a.status, count(*)
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
GROUP BY a.status;

-- Verification: remaining false alerts for PERAVARUNI branch
SELECT a.id, c.channel, a.title, a.status, a.created_at
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
  AND a.status = 'false_alarm'
ORDER BY a.created_at ASC;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
