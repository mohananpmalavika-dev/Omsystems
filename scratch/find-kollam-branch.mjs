import { execSync } from "node:child_process";

const sql = `
-- Find KOLLAM branch
SELECT id, name, code FROM branches WHERE name ILIKE '%kollam%';

-- Find resource_nodes for KOLLAM
SELECT id, name, node_type, parent_id, path FROM resource_nodes WHERE name ILIKE '%kollam%';

-- Find cameras belonging to KOLLAM branch
SELECT c.id, c.channel, rn.name as camera_name, c.branch_node_id
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id IN (SELECT id FROM branches WHERE name ILIKE '%kollam%')
   OR c.branch_node_id IN (SELECT id FROM resource_nodes WHERE name ILIKE '%kollam%');
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
