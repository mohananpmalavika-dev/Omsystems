import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );
}

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const { accessToken } = await loginRes.json();

console.log("=== UPDATING KOLLAM CAMERAS TO 128f918d ===");
console.log(runSql(`
  UPDATE cameras
  SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
      connection_secret_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch' || channel
  WHERE branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5';

  UPDATE device_identities
  SET edge_agent_id = '128f918d-3943-4049-af05-36857b66d41b',
      credential_ref = 'edge://128f918d-3943-4049-af05-36857b66d41b/kollam-ch' || channel
  WHERE id IN (
    SELECT device_identity_id
    FROM cameras
    WHERE branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
  );
`));

console.log("\n=== TESTING KOLLAM CH 1-8 VIA 128f918d ===");
const camRows = runSql(`
  SELECT c.id, c.channel
  FROM cameras c
  WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
  ORDER BY c.channel;
`).trim().split('\n').filter(r => r.includes('|') && !r.includes('id'));

for (const row of camRows) {
  const [camId, ch] = row.split('|').map(s => s.trim());
  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ KOLLAM Ch ${ch}: session failed:`, sData);
      continue;
    }
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status === 201) {
      console.log(`✅ KOLLAM Ch ${ch}: Stream started successfully! URL: ${startData.hls?.url}`);
    } else {
      console.log(`❌ KOLLAM Ch ${ch}: start failed (HTTP ${startRes.status}):`, startData);
    }
  } catch (err) {
    console.log(`❌ KOLLAM Ch ${ch}: exception: ${err.message}`);
  }
}
