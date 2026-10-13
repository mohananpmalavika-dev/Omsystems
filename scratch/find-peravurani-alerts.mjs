import { execSync } from "node:child_process";

const sql = `
-- Check columns of analytics_alerts
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'analytics_alerts';

-- Check cameras for PERAVARUNI
SELECT c.id, c.channel, rn.name as camera_name, c.branch_node_id
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

-- Check alerts for these cameras in analytics_alerts
SELECT a.id, a.camera_id, a.title, a.status, a.severity, a.created_at
FROM analytics_alerts a
WHERE a.camera_id IN (SELECT id FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61')
ORDER BY a.created_at DESC
LIMIT 50;

-- Check status counts for these cameras
SELECT a.status, count(*)
FROM analytics_alerts a
WHERE a.camera_id IN (SELECT id FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61')
GROUP BY a.status;

-- Check if any alerts mention 'Perav' in title or description or metadata
SELECT a.id, a.camera_id, a.title, a.status, a.created_at
FROM analytics_alerts a
WHERE a.title ILIKE '%perav%' OR a.description ILIKE '%perav%'
ORDER BY a.created_at DESC
LIMIT 20;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
