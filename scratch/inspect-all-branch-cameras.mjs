import { execSync } from "node:child_process";

const sql = `
SELECT id, name, hostname, status, branch_node_id, last_seen_at FROM edge_agents;
SELECT c.branch_node_id, rn.name as branch_name, c.channel, c.status, c.source_type, c.vendor, c.model, c.ip_address, c.connection_transport, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.branch_node_id
ORDER BY rn.name, c.channel;
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
