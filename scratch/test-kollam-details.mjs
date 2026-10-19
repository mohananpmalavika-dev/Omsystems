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
const { accessToken } = await loginRes.json();

const camRows = runSql(`
  SELECT c.id, c.channel, c.connection_secret_ref, c.edge_agent_id
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  WHERE b.name = 'KOLLAM'
  ORDER BY c.channel;
`).trim().split('\n').filter(Boolean);

for (const row of camRows) {
  const [camId, ch, ref, ag] = row.split('|');
  console.log(`\n--- Testing KOLLAM Ch ${ch} (Cam: ${camId.slice(0, 8)}) ---`);
  console.log(`Secret ref: ${ref}, Agent: ${ag}`);

  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ Session failed:`, sData);
      continue;
    }

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status !== 201) {
      console.log(`❌ Start failed:`, startData);
      continue;
    }

    const hlsUrl = startData.hls?.url;
    const hlsToken = startData.hls?.bearerToken;
    console.log(`Stream started: ${hlsUrl}`);

    await new Promise(r => setTimeout(r, 3000));

    // Fetch master m3u8
    const mRes = await fetch(`${hlsUrl}?token=${hlsToken}`);
    const mText = await mRes.text();
    console.log(`Master playlist:\n${mText}`);

    const streamMatch = mText.match(/(video\d+_stream\.m3u8\S*)/);
    if (streamMatch) {
      const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
      const subUrl = baseUrl + streamMatch[1];
      const subRes = await fetch(subUrl);
      const subText = await subRes.text();
      console.log(`Sub playlist head:\n${subText.split('\n').slice(0, 10).join('\n')}`);
    }
  } catch (err) {
    console.error(`Exception:`, err.message);
  }
}
