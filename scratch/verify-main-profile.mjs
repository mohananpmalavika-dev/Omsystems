import { randomUUID, randomBytes, createHash } from 'crypto';
import { execSync } from 'child_process';

const cameras = [
  { id: 'f6a5eb84-90de-4cbd-ba9d-0453855e4692', name: 'Channel 1 (CP PLUS recorder)' },
  { id: '4834618d-8cac-4f1c-a0c8-82bedcb08803', name: 'Channel 2' },
  { id: 'f39e5525-3ab0-49da-8c38-b7fdff7a190c', name: 'Channel 3' },
  { id: '1a5b2602-8ae2-42c9-bd15-d3dc6fc5c5b1', name: 'Channel 4' },
  { id: '756956fe-dbdc-480f-8790-9f7e0ba52ddf', name: 'Channel 5' },
  { id: '83593346-d108-4888-b309-2b73b4bdc29e', name: 'Channel 6' },
  { id: '7ca35559-81fd-41e3-9d0d-c4855c7c217e', name: 'Channel 7' },
  { id: '5b36b23f-9c41-4103-9ad5-94f73c78ebcd', name: 'Channel 8' },
];

const userId = '043561dc-a162-48ca-b7e4-290a9c4ad1ff';
const agentId = '09181b97-0674-43ee-9d47-4b8c96f71a6b';
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

async function batchCreateTokens(cams, profile) {
  const tokens = {};
  const values = [];
  const expiresAt = new Date(Date.now() + 600_000).toISOString();

  for (const cam of cams) {
    const sessionId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
    tokens[cam.id] = token;
    values.push(`('${sessionId}', '${cam.id}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', '${profile}')`);
  }

  const sql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ${values.join(', ')};`;
  console.log('Inserting 8 session tokens in GCP database for MAIN profile...');
  execSync(`gcloud compute ssh kryptovision-server --zone asia-south1-b --command "sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`, { stdio: 'inherit' });
  return tokens;
}

async function testCamera(cam, profile, token) {
  const t0 = Date.now();
  try {
    const startRes = await fetch(`${relayBase}/v1/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: token, profile })
    });
    const session = await startRes.json();
    if (!startRes.ok || !session.hls?.url) {
      console.log(`❌ [${cam.name}] (${profile}) Live start failed:`, startRes.status, session);
      return false;
    }

    const hlsUrl = session.hls.url;
    const bearer = session.hls.bearerToken;
    let playlistOk = false;
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch(hlsUrl, {
          headers: { authorization: `Bearer ${bearer}` }
        });
        if (res.ok) {
          const text = await res.text();
          if (text.includes('#EXTINF') || text.includes('#EXT-X-STREAM-INF') || text.includes('#EXT-X-MAP')) {
            playlistOk = true;
            console.log(`✅ [${cam.name}] (${profile}) STREAMING OK in ${Date.now() - t0}ms: ${text.split('\n')[0]}`);
            break;
          }
        }
      } catch (e) {
        // retry
      }
    }
    if (!playlistOk) {
      console.log(`⚠️ [${cam.name}] (${profile}) Start succeeded, but no segments within 10s: ${session.hls.url}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ [${cam.name}] (${profile}) Error:`, err.message);
    return false;
  }
}

async function main() {
  console.log('=== TESTING CONCURRENT PLAYBACK OF ALL 8 CHANNELS (MAIN STREAM) ===');
  const tokens = await batchCreateTokens(cameras, 'main');
  
  console.log('Requesting live start on ALL 8 main channels simultaneously...');
  const results = await Promise.all(
    cameras.map(cam => testCamera(cam, 'main', tokens[cam.id]))
  );

  const passed = results.filter(Boolean).length;
  console.log(`\n=== RESULTS: ${passed}/${cameras.length} MAIN CHANNELS PLAYING CONCURRENTLY ===`);
}

main();
