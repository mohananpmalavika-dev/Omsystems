import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== FIXING PERAVARUNI CH 4 ===");
console.log(runSql(`
  UPDATE cameras
  SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795'
  WHERE id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76';

  UPDATE device_identities
  SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795'
  WHERE id = (SELECT device_identity_id FROM cameras WHERE id = '1fa8cd44-c782-40a3-81f2-a933fb2b1d76');
`));

console.log("=== LOGGING IN AND TESTING STREAM ===");
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken;

const sRes = await fetch(`${base}/v1/cameras/1fa8cd44-c782-40a3-81f2-a933fb2b1d76/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("Session data:", sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("Start response:", startRes.status, startData);

const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("HLS playlist status:", hlsRes.status);
