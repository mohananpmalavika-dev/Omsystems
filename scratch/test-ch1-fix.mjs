import { execSync } from 'node:child_process';

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

const updateSql = `
UPDATE cameras 
SET edge_agent_id = '748eeb31-76f8-43e9-9121-4c1d99166e87',
    connection_secret_ref = 'edge://748eeb31-76f8-43e9-9121-4c1d99166e87/hajipur-ch1'
WHERE id = '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c';
`;

console.log('Updating Channel 1...');
console.log(runSql(updateSql));

const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const sRes = await fetch(`${base}/v1/cameras/574ec320-ad4a-4c40-9a6d-76fa7cf7d13c/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log('live-sessions:', sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log('startRes status:', startRes.status, startData);

if (startData.hls) {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    console.log(`HLS attempt ${i + 1}: status ${hlsRes.status}`);
    if (hlsRes.status === 200) {
      const text = await hlsRes.text();
      console.log('HLS manifest:\n', text);
      break;
    }
  }
}
