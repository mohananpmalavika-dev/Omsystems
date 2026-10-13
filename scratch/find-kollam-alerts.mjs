import { execSync } from "node:child_process";

const sql = `
-- Check status counts for KOLLAM branch
SELECT a.status, count(*)
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
GROUP BY a.status;

-- List all false alerts for KOLLAM branch
SELECT 
    a.id, 
    c.channel, 
    rn.name AS camera_name, 
    a.title, 
    a.severity,
    a.status, 
    a.created_at
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
  AND a.status = 'false_alarm'
ORDER BY a.created_at ASC;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
