import { execSync } from "node:child_process";

const sql = `
SELECT id, name, node_type, parent_id, path FROM resource_nodes WHERE name ILIKE '%perav%';
SELECT id, name, branch_node_id, status, last_seen_at FROM edge_agents WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
SELECT id, resource_node_id, branch_node_id, edge_agent_id, channel, recorder_channel, status, last_seen_at, ip_address, model, vendor, source_type 
FROM cameras 
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
