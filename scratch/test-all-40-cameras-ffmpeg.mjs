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

const cameraRows = runSql(`
  SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
  FROM cameras c
  JOIN branches b ON b.id = c.branch_node_id
  ORDER BY b.name, c.channel;
`).trim().split('\n').filter(Boolean);

console.log(`Testing all ${cameraRows.length} cameras...`);

const results = [];

if (!fs.existsSync('scratch/frames')) {
  fs.mkdirSync('scratch/frames', { recursive: true });
}

for (const row of cameraRows) {
  const [camId, ch, branch, agentId, secretRef, dbStatus] = row.split('|');
  const label = `${branch}_Ch${ch}`;

  try {
    const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ ${label}: Live session error: ${sData.message || sRes.status}`);
      results.push({ branch, ch, status: 'FAILED_SESSION', error: sData.message || sRes.status });
      continue;
    }

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (startRes.status !== 201 || !startData.hls) {
      console.log(`❌ ${label}: Start error: ${startData.message || startRes.status}`);
      results.push({ branch, ch, status: 'FAILED_START', error: startData.message || startRes.status });
      continue;
    }

    const hlsUrl = startData.hls.url;
    const hlsToken = startData.hls.bearerToken;
    const framePath = `scratch/frames/${label}.jpg`;

    // Try capturing 1 frame with ffmpeg
    try {
      execSync(`ffmpeg -y -headers "Authorization: Bearer ${hlsToken}" -t 5 -i "${hlsUrl}" -frames:v 1 "${framePath}"`, {
        stdio: 'pipe',
        timeout: 10000
      });
      const stats = fs.statSync(framePath);
      console.log(`✅ ${label}: Frame captured (${stats.size} bytes)`);
      results.push({ branch, ch, status: 'OK', size: stats.size });
    } catch (ffErr) {
      console.log(`❌ ${label}: ffmpeg capture failed: ${ffErr.message.slice(0, 100)}`);
      results.push({ branch, ch, status: 'FFMPEG_FAILED', error: ffErr.message.slice(0, 100) });
    }
  } catch (err) {
    console.log(`❌ ${label}: Exception: ${err.message}`);
    results.push({ branch, ch, status: 'EXCEPTION', error: err.message });
  }
}

console.log("\n================ RESULTS SUMMARY ================");
const ok = results.filter(r => r.status === 'OK');
const bad = results.filter(r => r.status !== 'OK');
console.log(`OK: ${ok.length}/${results.length}`);
console.log(`BAD: ${bad.length}/${results.length}`);
if (bad.length > 0) {
  console.log("BAD CAMERAS:");
  console.log(JSON.stringify(bad, null, 2));
}
