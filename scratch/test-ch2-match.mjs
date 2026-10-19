import { execSync } from 'node:child_process';

const camId = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53'; // Kollam ch 2

const sql = `
UPDATE cameras
SET vendor = 'other',
    ip_address = '172.28.18.100',
    recorder_id = NULL
WHERE id = '${camId}';
`;

const b64 = Buffer.from(sql).toString('base64');
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { stdio: 'inherit' }
);

const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();

const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("HLS Status:", hlsRes.status);
console.log("HLS Body:", (await hlsRes.text()).slice(0, 150));
