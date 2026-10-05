import { execSync } from "node:child_process";

const sql = `
SELECT id, name, hostname, status, branch_node_id, last_seen_at FROM edge_agents;
SELECT * FROM cameras WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
SELECT * FROM camera_credentials WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
SELECT reference, edge_agent_id, updated_at FROM central_stream_secrets WHERE reference LIKE '%perav%';
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
