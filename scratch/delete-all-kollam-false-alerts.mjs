import { execSync } from "node:child_process";

const sql = `
BEGIN;

-- Collect all remaining false alert IDs for KOLLAM branch
CREATE TEMP TABLE kollam_false_alerts AS
SELECT a.id
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
  AND a.status = 'false_alarm';

-- Count how many are being targeted
SELECT count(*) AS target_alerts_count FROM kollam_false_alerts;

-- Delete referencing rows from child tables
DELETE FROM analytics_notifications
WHERE alert_id IN (SELECT id FROM kollam_false_alerts);

DELETE FROM analytics_escalations
WHERE alert_id IN (SELECT id FROM kollam_false_alerts);

DELETE FROM analytics_acknowledgements
WHERE alert_id IN (SELECT id FROM kollam_false_alerts);

-- Delete from analytics_alerts
DELETE FROM analytics_alerts
WHERE id IN (SELECT id FROM kollam_false_alerts);

COMMIT;

-- Verify status counts for KOLLAM branch
SELECT a.status, count(*)
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
GROUP BY a.status;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
