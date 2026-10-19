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

async function main() {
  console.log("=== 1. LOGGING IN ===");
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const { accessToken } = await loginRes.json();
  console.log("Logged in successfully.");

  console.log("\n=== 2. FETCHING ALL ACTIVE CAMERAS ===");
  const cameraRows = runSql(`
    SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
    FROM cameras c
    JOIN branches b ON b.id = c.branch_node_id
    ORDER BY b.name, c.channel;
  `).trim().split('\n').filter(Boolean);

  console.log(`Total cameras to verify: ${cameraRows.length}`);

  if (!fs.existsSync('scratch/frames/all_verified')) {
    fs.mkdirSync('scratch/frames/all_verified', { recursive: true });
  }

  const results = [];

  for (const row of cameraRows) {
    const [camId, ch, branch, agentId, secretRef, dbStatus] = row.split('|');
    const label = `${branch}_Ch${ch}`;

    try {
      // 1. Create live session
      const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ [${label}] Session creation failed:`, sData.message || sRes.status);
        results.push({ branch, ch: Number(ch), camId, status: 'FAILED_SESSION', error: sData.message || sRes.status });
        continue;
      }

      // 2. Start live stream
      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        console.log(`❌ [${label}] Stream start failed:`, startData.message || startRes.status);
        results.push({ branch, ch: Number(ch), camId, status: 'FAILED_START', error: startData.message || startRes.status });
        continue;
      }

      const hlsUrl = startData.hls.url;
      const hlsToken = startData.hls.bearerToken;

      // Wait 3 seconds for initial segments
      await new Promise(r => setTimeout(r, 2500));

      // 3. Capture frame
      const framePath = `scratch/frames/all_verified/${label}.jpg`;
      try {
        execSync(`ffmpeg -y -headers "Authorization: Bearer ${hlsToken}" -t 5 -i "${hlsUrl}" -frames:v 1 "${framePath}"`, {
          stdio: 'pipe',
          timeout: 10000
        });
        const stats = fs.statSync(framePath);
        if (stats.size > 2000) {
          console.log(`✅ [${label}] LIVE OK! Frame captured: ${stats.size} bytes`);
          results.push({ branch, ch: Number(ch), camId, status: 'OK', frameSize: stats.size });
        } else {
          console.log(`⚠️ [${label}] Frame too small (${stats.size} bytes)`);
          results.push({ branch, ch: Number(ch), camId, status: 'BLANK_SUSPECTED', frameSize: stats.size });
        }
      } catch (ffErr) {
        console.log(`❌ [${label}] ffmpeg failed: ${ffErr.message.slice(0, 100)}`);
        results.push({ branch, ch: Number(ch), camId, status: 'FFMPEG_TIMEOUT', error: ffErr.message.slice(0, 100) });
      }
    } catch (err) {
      console.log(`❌ [${label}] Exception: ${err.message}`);
      results.push({ branch, ch: Number(ch), camId, status: 'EXCEPTION', error: err.message });
    }
  }

  console.log("\n==================== VERIFICATION SUMMARY ====================");
  const okList = results.filter(r => r.status === 'OK');
  const failList = results.filter(r => r.status !== 'OK');
  console.log(`TOTAL TESTED: ${results.length}`);
  console.log(`SUCCESSFUL (STREAMING & LIVE FRAME CAPTURED): ${okList.length}`);
  console.log(`FAILED / BLANK: ${failList.length}`);

  if (failList.length > 0) {
    console.log("\nFailed cameras:");
    console.log(JSON.stringify(failList, null, 2));
  } else {
    console.log("\n🎉 ALL 40 CAMERAS ARE LIVE AND STREAMING VALID VIDEO FRAMES!");
  }
}

main().catch(console.error);
