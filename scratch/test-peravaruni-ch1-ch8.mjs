import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

function runSql(query) {
  const b64 = Buffer.from(query).toString('base64');
  return execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A"`,
    { encoding: 'utf8' }
  );
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const { accessToken: token } = await loginRes.json();

  const rows = runSql(`
    SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
    FROM cameras c
    JOIN branches b ON b.id = c.branch_node_id
    WHERE b.name = 'PERAVARUNI' AND c.channel = 6
    ORDER BY c.channel;
  `).trim().split('\n').filter(Boolean);

  console.log("Testing Peravaruni cameras:", rows);

  for (const row of rows) {
    const [camId, ch, branch, agentId, secretRef, dbStatus] = row.split('|');
    console.log(`\n--- Testing ${branch} Ch ${ch} (ID: ${camId}, secretRef: ${secretRef}, agent: ${agentId}) ---`);

    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    console.log("Live session:", sRes.status, sData);

    if (!sRes.ok) continue;

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    console.log("Start live:", startRes.status, startData);

    if (startRes.status !== 201) continue;

    const hlsUrl = startData.hls.url;
    const hlsToken = startData.hls.bearerToken;

    // Retry fetching m3u8 up to 5 times with 2s delay
    for (let attempt = 1; attempt <= 5; attempt++) {
      await sleep(2000);
      const mRes = await fetch(`${hlsUrl}?token=${hlsToken}`);
      console.log(`Attempt ${attempt}: m3u8 status = ${mRes.status}`);
      if (mRes.status === 200) {
        const text = await mRes.text();
        console.log("Master playlist:\n", text);
        break;
      } else {
        const errText = await mRes.text();
        console.log("Error text:", errText.slice(0, 200));
      }
    }
  }
}

main().catch(console.error);
