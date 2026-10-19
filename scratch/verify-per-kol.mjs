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
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name IN ('PERAVARUNI', 'KOLLAM')
  ORDER BY b.name, c.channel;
`).trim().split('\n').filter(Boolean);

console.log(`Testing ${rows.length} cameras across PERAVARUNI and KOLLAM...`);

let successCount = 0;
for (const row of rows) {
  const [camId, ch, branch, ag, ref] = row.split('|');
  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ ${branch} Ch ${ch}: session failed`, sData);
      continue;
    }

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status !== 201 || !startData.hls) {
      console.log(`❌ ${branch} Ch ${ch}: start failed (${startRes.status})`, startData);
      continue;
    }

    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    if (hlsRes.status === 200) {
      console.log(`✅ ${branch} Ch ${ch}: LIVE STREAM OK (HLS 200)`);
      successCount++;
    } else {
      console.log(`❌ ${branch} Ch ${ch}: HLS status ${hlsRes.status}`);
    }
  } catch (err) {
    console.log(`❌ ${branch} Ch ${ch}: ${err.message}`);
  }
}

console.log(`\nResult: ${successCount}/${rows.length} streams successfully active!`);
