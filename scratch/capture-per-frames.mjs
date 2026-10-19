import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camRows = runSql(`
  SELECT c.id, c.channel
  FROM cameras c
  WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
  ORDER BY c.channel;
`).trim().split('\n').filter(Boolean);

for (const row of camRows) {
  const [camId, ch] = row.split('|');
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
  const hlsUrl = startData.hls.url;
  const hlsToken = startData.hls.bearerToken;
  const framePath = `scratch/frames/Peravaruni_Ch${ch}.jpg`;

  try {
    execSync(`ffmpeg -y -headers "Authorization: Bearer ${hlsToken}" -t 5 -i "${hlsUrl}" -frames:v 1 "${framePath}"`, {
      stdio: 'pipe',
      timeout: 10000
    });
    const stats = fs.statSync(framePath);
    console.log(`✅ Peravaruni Ch ${ch}: Frame captured (${stats.size} bytes)`);
  } catch (err) {
    console.log(`❌ Peravaruni Ch ${ch}: frame capture failed: ${err.message.slice(0, 100)}`);
  }
}
