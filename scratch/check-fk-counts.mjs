import { execSync } from "node:child_process";

const sql = `
WITH target_alerts AS (
  SELECT a.id
  FROM analytics_alerts a
  JOIN cameras c ON c.id = a.camera_id
  WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
    AND a.status = 'false_alarm'
)
SELECT 
  (SELECT count(*) FROM analytics_notifications WHERE alert_id IN (SELECT id FROM target_alerts)) AS notif_count,
  (SELECT count(*) FROM analytics_escalations WHERE alert_id IN (SELECT id FROM target_alerts)) AS esc_count,
  (SELECT count(*) FROM analytics_acknowledgements WHERE alert_id IN (SELECT id FROM target_alerts)) AS ack_count;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
