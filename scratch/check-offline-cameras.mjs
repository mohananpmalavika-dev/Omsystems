import { execSync } from "node:child_process";

const sql = `
SELECT status, count(*) FROM cameras GROUP BY status;

SELECT 
  c.id, 
  c.channel, 
  c.status, 
  c.branch_node_id, 
  b.name as branch_name, 
  p.name as zone_name,
  rn.name as rn_name,
  rn.is_active as rn_active
FROM cameras c
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN resource_nodes p ON b.parent_id = p.id
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.status != 'online' OR p.name ILIKE '%south%' OR b.name ILIKE '%kollam%' OR b.name ILIKE '%pera%';
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
