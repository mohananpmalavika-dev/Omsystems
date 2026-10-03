import { execSync } from "node:child_process";

const cmd = `curl -s http://127.0.0.1:8080/v1/branches/00000000-0000-4000-8000-000000000104/edge-agents`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
