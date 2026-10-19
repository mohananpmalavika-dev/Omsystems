import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

async function testSouthZone() {
  console.log("=== 1. LOGGING IN ===");
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log("Logged in. User:", loginData.user?.username);

  // Check South Zone cameras
  const query = `
    SELECT 
      c.id, 
      c.channel, 
      b.name as branch, 
      COALESCE(p.name, 'No Zone') as zone,
      c.status
    FROM cameras c
    JOIN resource_nodes b ON b.id = c.branch_node_id
    LEFT JOIN resource_nodes p ON b.parent_id = p.id
    WHERE p.name ILIKE '%south%' OR b.name ILIKE '%pera%' OR b.name ILIKE '%kollam%'
    ORDER BY b.name, c.channel;
  `;
  const rows = runSql(query).trim().split('\n').filter(Boolean);
  console.log(`Found ${rows.length} cameras associated with South / Peravaruni / Kollam:`);

  for (const row of rows) {
    const [camId, ch, branch, zone, dbStatus] = row.split('|');
    const label = `[${zone}] ${branch} Ch ${ch}`;

    try {
      const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ ${label}: Session failed - status ${sRes.status}, error:`, sData.message || sData.error || sData);
        continue;
      }

      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        console.log(`❌ ${label}: Start failed (${startRes.status}):`, startData.message || startData);
        continue;
      }

      await new Promise(r => setTimeout(r, 1500));
      const hlsUrl = startData.hls.url;
      const hlsToken = startData.hls.bearerToken;
      const mRes = await fetch(`${hlsUrl}?token=${hlsToken}`);
      const mText = await mRes.text();

      if (mRes.status !== 200) {
        console.log(`❌ ${label}: Master playlist HTTP ${mRes.status}`);
        continue;
      }

      console.log(`✅ ${label}: LIVE STREAM ONLINE & WORKING!`);
    } catch (err) {
      console.log(`❌ ${label}: Error:`, err.message);
    }
  }
}

testSouthZone().catch(console.error);
