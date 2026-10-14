import { execSync } from "node:child_process";

const sql = `
BEGIN;

CREATE TEMP TABLE alerts_to_purge AS
SELECT a.id
FROM analytics_alerts a
LEFT JOIN cameras c ON c.id = a.camera_id
WHERE a.status = 'suppressed'
   OR c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5';

SELECT count(*) AS alerts_identified_for_deletion FROM alerts_to_purge;

DELETE FROM analytics_notifications
WHERE alert_id IN (SELECT id FROM alerts_to_purge);

DELETE FROM analytics_escalations
WHERE alert_id IN (SELECT id FROM alerts_to_purge);

DELETE FROM analytics_acknowledgements
WHERE alert_id IN (SELECT id FROM alerts_to_purge);

DELETE FROM analytics_alerts
WHERE id IN (SELECT id FROM alerts_to_purge);

COMMIT;

-- Verification breakdown
SELECT status, count(*) AS remaining_count
FROM analytics_alerts
GROUP BY status;

SELECT count(*) AS remaining_kollam_alerts
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5';
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
