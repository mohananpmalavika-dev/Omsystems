import { execSync } from "node:child_process";

const sql = `
SELECT device_type, device_id, branch_id, observed_at, quality, metrics, reason_codes 
FROM operational_health_telemetry 
WHERE branch_id IN ('6ddee070-9050-4f55-aaa1-1190654bbc6b', 'd8467a57-dae8-4012-ba5e-c3254075aa61', '921d336d-baa9-4b25-9f9f-f6542bba94cc')
AND device_type = 'camera'
ORDER BY observed_at DESC LIMIT 10;

SELECT count(*) FROM operational_health_telemetry WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/"/g, '\\"')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log(result);
