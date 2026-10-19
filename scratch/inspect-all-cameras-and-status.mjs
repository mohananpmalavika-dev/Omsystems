import { execSync } from "node:child_process";

const sql = `
SELECT 
  p.name as zone_name,
  b.name as branch_name,
  c.id as camera_id,
  c.channel,
  c.ip_address,
  c.status as camera_status,
  rn.is_active as rn_active,
  ohl.metrics->>'status' as health_status,
  ohl.metrics->>'streamActive' as stream_active
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN resource_nodes p ON b.parent_id = p.id
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN operational_health_latest ohl ON (ohl.device_id = c.id::text AND ohl.device_type = 'camera')
ORDER BY p.name, b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
