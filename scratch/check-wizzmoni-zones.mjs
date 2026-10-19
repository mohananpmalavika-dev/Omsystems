import { execSync } from "node:child_process";

const sql = `
SELECT id, name, node_type, parent_id, path 
FROM resource_nodes 
WHERE parent_id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c' OR id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c';

SELECT id, name, node_type, parent_id, path
FROM resource_nodes
WHERE parent_id IN (SELECT id FROM resource_nodes WHERE parent_id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c');
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
