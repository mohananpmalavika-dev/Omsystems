import { execSync } from "node:child_process";

const sql = `
-- 15 oldest false alerts in KOLLAM
WITH oldest15 AS (
  SELECT a.id, c.channel, rn.name as camera_name, a.title, a.status, a.created_at
  FROM analytics_alerts a
  JOIN cameras c ON c.id = a.camera_id
  LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
  WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
    AND a.status = 'false_alarm'
  ORDER BY a.created_at ASC
  LIMIT 15
)
SELECT * FROM oldest15;

-- Check FKs for oldest 15
WITH oldest15 AS (
  SELECT a.id
  FROM analytics_alerts a
  JOIN cameras c ON c.id = a.camera_id
  WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
    AND a.status = 'false_alarm'
  ORDER BY a.created_at ASC
  LIMIT 15
)
SELECT 
  (SELECT count(*) FROM analytics_notifications WHERE alert_id IN (SELECT id FROM oldest15)) as notif_count,
  (SELECT count(*) FROM analytics_escalations WHERE alert_id IN (SELECT id FROM oldest15)) as esc_count,
  (SELECT count(*) FROM analytics_acknowledgements WHERE alert_id IN (SELECT id FROM oldest15)) as ack_count;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
