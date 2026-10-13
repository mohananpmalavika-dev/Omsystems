import { execSync } from 'node:child_process';

const sql = `SELECT id, username, email, role, status FROM users LIMIT 15;`;
const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

try {
  const result = execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`,
    { encoding: "utf8", timeout: 20000 }
  );
  console.log(result);
} catch (e) {
  console.error("Error:", e.message);
}
