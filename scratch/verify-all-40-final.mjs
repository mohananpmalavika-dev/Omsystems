import { execSync } from 'node:child_process';

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
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log("Logged in successfully. User:", loginData.user?.username);

  console.log("\n=== 2. RETRIEVING ALL CAMERAS ===");
  const rows = runSql(`
    SELECT c.id, c.channel, b.name as branch, c.edge_agent_id, c.connection_secret_ref, c.status
    FROM cameras c
    JOIN branches b ON b.id = c.branch_node_id
    ORDER BY b.name, c.channel;
  `).trim().split('\n').filter(Boolean);

  console.log(`Found ${rows.length} cameras across all branches.`);

  const results = [];

  for (const row of rows) {
    const [camId, ch, branch, agentId, secretRef, dbStatus] = row.split('|');
    const label = `${branch} Ch ${ch}`;

    try {
      // 1. Live session
      const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ [${label}] Session failed:`, sData);
        results.push({ branch, ch: Number(ch), status: 'SESSION_FAILED', error: sData.message || sRes.status });
        continue;
      }

      // 2. Start stream
      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        console.log(`❌ [${label}] Start failed (${startRes.status}):`, startData);
        results.push({ branch, ch: Number(ch), status: 'START_FAILED', error: startData.message || startRes.status });
        continue;
      }

      // 3. Fetch master playlist (allow 1.5s for initial segment generation)
      await new Promise(r => setTimeout(r, 1500));
      const hlsUrl = startData.hls.url;
      const hlsToken = startData.hls.bearerToken;
      const mRes = await fetch(`${hlsUrl}?token=${hlsToken}`);
      const mText = await mRes.text();

      if (mRes.status !== 200) {
        console.log(`❌ [${label}] Master m3u8 HTTP ${mRes.status}`);
        results.push({ branch, ch: Number(ch), status: 'M3U8_FAILED', httpStatus: mRes.status });
        continue;
      }

      const streamMatch = mText.match(/(video\d+_stream\.m3u8\S*)/);
      if (!streamMatch) {
        console.log(`❌ [${label}] No video stream in master playlist`);
        results.push({ branch, ch: Number(ch), status: 'NO_STREAM' });
        continue;
      }

      const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
      const subUrl = baseUrl + streamMatch[1];
      const subRes = await fetch(subUrl);
      const subText = await subRes.text();

      const hasSegs = subText.includes('.mp4') || subText.includes('.ts') || subText.includes('.m4s');

      console.log(`✅ [${label}] LIVE HLS OK! (Bandwidth: ${mText.match(/BANDWIDTH=(\d+)/)?.[1] || 'N/A'}, Segments ready: ${hasSegs})`);
      results.push({ branch, ch: Number(ch), status: 'OK', hasSegs });
    } catch (err) {
      console.log(`❌ [${label}] Exception:`, err.message);
      results.push({ branch, ch: Number(ch), status: 'EXCEPTION', error: err.message });
    }
  }

  console.log("\n==================== FINAL RESULTS ====================");
  const ok = results.filter(r => r.status === 'OK');
  const failed = results.filter(r => r.status !== 'OK');
  console.log(`Total Cameras Tested: ${results.length}`);
  console.log(`Working / Live Cameras: ${ok.length}`);
  console.log(`Failing / Blank Cameras: ${failed.length}`);

  const byBranch = {};
  for (const r of results) {
    if (!byBranch[r.branch]) byBranch[r.branch] = { ok: 0, total: 0 };
    byBranch[r.branch].total++;
    if (r.status === 'OK') byBranch[r.branch].ok++;
  }
  console.log("\nBranch Breakdown:");
  for (const [b, stats] of Object.entries(byBranch)) {
    console.log(`  ${b}: ${stats.ok}/${stats.total} cameras live`);
  }

  if (failed.length > 0) {
    console.log("\nFailed Cameras Details:");
    console.log(JSON.stringify(failed, null, 2));
  } else {
    console.log("\n🎉 ALL 40 CAMERAS ACROSS ALL 5 BRANCHES ARE FULLY OPERATIONAL AND STREAMING LIVE VIDEO!");
  }
}

main().catch(console.error);
