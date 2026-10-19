import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

console.log("=== FIXING PERAVARUNI EDGE AGENT IDS ===");
console.log(runSql(`
  UPDATE cameras
  SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795'
  WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

  UPDATE device_identities
  SET edge_agent_id = '6dd10cd4-5625-48f4-8431-23776bbd0795'
  WHERE id IN (
    SELECT device_identity_id
    FROM cameras
    WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
  );
`));

console.log("\n=== TESTING PERAVARUNI CHANNELS 1-8 ===");
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
`).trim().split('\n').filter(r => r.includes('|') && !r.includes('id'));

for (const row of camRows) {
  const [camId, ch] = row.split('|').map(s => s.trim());
  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ Peravaruni Ch ${ch}: session failed:`, sData);
      continue;
    }
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status === 201) {
      console.log(`✅ Peravaruni Ch ${ch}: Stream started successfully! URL: ${startData.hls?.url}`);
    } else {
      console.log(`❌ Peravaruni Ch ${ch}: start failed (HTTP ${startRes.status}):`, startData);
    }
  } catch (err) {
    console.log(`❌ Peravaruni Ch ${ch}: exception: ${err.message}`);
  }
}
