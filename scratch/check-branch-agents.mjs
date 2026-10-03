import { execSync } from "node:child_process";

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, name, version, status, last_seen_at, credential_revoked_at, created_at FROM edge_agents WHERE branch_node_id = '00000000-0000-4000-8000-000000000104' ORDER BY created_at ASC;"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
