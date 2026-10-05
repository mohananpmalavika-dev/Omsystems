import { execSync } from "node:child_process";

const sql = `
SELECT c.id, c.channel, c.recorder_channel, c.status, c.model, c.source_type, c.ip_address, c.connection_secret_ref, rn.id as node_id, rn.name as node_name, di.id as di_id
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
LEFT JOIN device_identities di ON di.id = c.device_identity_id
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY c.channel, c.created_at;
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
