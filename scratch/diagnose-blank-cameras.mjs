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
  console.log("=== LOGGING IN ===");
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

  console.log(`Checking ${cameraRows.length} cameras...`);

  const results = [];

  for (const row of cameraRows) {
    const [camId, ch, branch, agentId, secretRef, dbStatus] = row.split('|');

    try {
      const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        results.push({ branch, ch: Number(ch), status: 'FAILED_SESSION', error: sData.message || sRes.status });
        console.log(`❌ [${branch} Ch ${ch}] Failed session: ${sData.message || sRes.status}`);
        continue;
      }

      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        results.push({ branch, ch: Number(ch), status: 'FAILED_START', error: startData.message || startRes.status });
        console.log(`❌ [${branch} Ch ${ch}] Failed start: ${startData.message || startRes.status}`);
        continue;
      }

      const hlsUrl = startData.hls.url;
      const hlsToken = startData.hls.bearerToken;

      // 1. Fetch master playlist
      const m3u8Res = await fetch(`${hlsUrl}?token=${hlsToken}`);
      const m3u8Text = await m3u8Res.text();

      // Look for stream uri
      const streamMatch = m3u8Text.match(/(video\d+_stream\.m3u8\S*)/);
      if (!streamMatch) {
        results.push({ branch, ch: Number(ch), status: 'NO_STREAM_IN_MASTER', text: m3u8Text.slice(0, 100) });
        console.log(`❌ [${branch} Ch ${ch}] No stream in master: ${m3u8Text.slice(0, 50)}`);
        continue;
      }

      const streamPath = streamMatch[1];
      const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
      const subPlaylistUrl = baseUrl + streamPath;

      // 2. Fetch sub playlist (media playlist)
      const subRes = await fetch(subPlaylistUrl);
      const subText = await subRes.text();

      const segMatch = subText.match(/(.*\.mp4\S*|.*\.ts\S*|.*\.m4s\S*)/);
      if (!segMatch) {
        results.push({ branch, ch: Number(ch), status: 'NO_SEGMENTS', text: subText.slice(0, 100) });
        console.log(`⚠️ [${branch} Ch ${ch}] No segments in media playlist: ${subText.slice(0, 60)}`);
        continue;
      }

      const firstSeg = segMatch[1];
      const firstSegUrl = baseUrl + firstSeg;

      // 3. Test segment download
      const segRes = await fetch(firstSegUrl);
      if (segRes.status === 200) {
        const buf = await segRes.arrayBuffer();
        results.push({ branch, ch: Number(ch), status: 'OK', segBytes: buf.byteLength });
        console.log(`✅ [${branch} Ch ${ch}] OK (segment size: ${buf.byteLength} bytes)`);
      } else {
        results.push({ branch, ch: Number(ch), status: 'SEGMENT_FETCH_FAILED', httpStatus: segRes.status });
        console.log(`❌ [${branch} Ch ${ch}] Segment fetch failed: HTTP ${segRes.status}`);
      }
    } catch (err) {
      results.push({ branch, ch: Number(ch), status: 'EXCEPTION', error: err.message });
      console.log(`❌ [${branch} Ch ${ch}] Exception: ${err.message}`);
    }
  }

  console.log("\n================ SUMMARY ================");
  const ok = results.filter(r => r.status === 'OK');
  const failed = results.filter(r => r.status !== 'OK');
  console.log(`Total OK: ${ok.length}/${results.length}`);
  console.log(`Total FAILED / ISSUES: ${failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log("\nDetails of failed cameras:");
    console.log(JSON.stringify(failed, null, 2));
  }
}

main().catch(console.error);
