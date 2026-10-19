import { execSync } from "node:child_process";

const sql = `
-- Check columns in cameras
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cameras';

-- Check all branches and their zones in resource_nodes
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  b.node_type,
  b.parent_id,
  p.name as parent_name,
  p.node_type as parent_type,
  b.is_active
FROM resource_nodes b
LEFT JOIN resource_nodes p ON b.parent_id = p.id
WHERE b.node_type IN ('branch', 'area')
ORDER BY p.name, b.name;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
