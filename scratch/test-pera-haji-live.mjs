import { execSync } from 'node:child_process';

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

const rows = runSql(`
SELECT c.id, c.channel, b.name as branch, c.status, c.connection_secret_ref, c.edge_agent_id, ea.name as agent_name, ea.status as agent_status
FROM cameras c
JOIN branches b ON b.id = c.branch_node_id
LEFT JOIN edge_agents ea ON ea.id = c.edge_agent_id
WHERE b.name IN ('PERAVARUNI', 'Hajipur')
ORDER BY b.name, c.channel;
`).trim().split('\n');

for (const row of rows) {
  if (!row) continue;
  const [camId, ch, branch, camStatus, ref, agId, agName, agStatus] = row.split('|');
  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ ${branch} Ch ${ch}: No token/mediaGatewayUrl ->`, sData.message || sData.error || sData);
      continue;
    }

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status !== 201 || !startData.hls) {
      console.log(`❌ ${branch} Ch ${ch}: live/start failed (${startRes.status}) ->`, startData.error || startData.message || startData);
      continue;
    }

    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    if (hlsRes.status === 200) {
      const text = await hlsRes.text();
      const hasSegments = text.includes('.ts') || text.includes('EXTINF');
      console.log(`✅ ${branch} Ch ${ch}: HLS 200 OK! (Has segments: ${hasSegments}) [Agent: ${agName}]`);
    } else {
      console.log(`❌ ${branch} Ch ${ch}: HLS status ${hlsRes.status}`);
    }
  } catch (err) {
    console.log(`❌ ${branch} Ch ${ch}: Error ${err.message}`);
  }
}
