import { execSync } from "node:child_process";

const sql = `
SELECT id, name, hostname, status, branch_node_id, last_seen_at, local_media_url 
FROM edge_agents 
WHERE id = '9f108498-4dd5-4a21-b810-eec9e538953c';
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
