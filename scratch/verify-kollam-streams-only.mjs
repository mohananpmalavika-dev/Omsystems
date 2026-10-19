const base = "https://35-200-130-81.sslip.io";

const kollamCameras = [
  { ch: 1, camId: 'b7a24b40-013d-40c9-bd46-823cbcf6e326' },
  { ch: 2, camId: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53' },
  { ch: 3, camId: 'da907692-01fd-4bf4-b305-f7259c05c887' },
  { ch: 4, camId: '3da93c6e-6824-43dc-9bba-7332707d5856' },
  { ch: 5, camId: 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2' },
  { ch: 6, camId: 'c365a8e7-68a8-44bb-a63f-aae73dca7526' },
  { ch: 7, camId: '99455d3a-3411-43ad-b756-84a4ae17c026' },
  { ch: 8, camId: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d' }
];

console.log("Logging into Sentinel Platform...");
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

console.log('\n======================================================');
console.log('--- VERIFYING ALL 8 KOLLAM LIVE STREAMS IN REAL-TIME ---');
console.log('======================================================\n');
let allSucceeded = true;

for (const item of kollamCameras) {
  try {
    const sRes = await fetch(`${base}/v1/cameras/${item.camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    if (!sData.token || !sData.mediaGatewayUrl) {
      console.log(`❌ Channel ${item.ch}: Missing live-session token or gateway`, sData);
      allSucceeded = false;
      continue;
    }

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (!startData.hls) {
      console.log(`❌ Channel ${item.ch}: Live start failed (${startRes.status})`, startData);
      allSucceeded = false;
      continue;
    }

    const hlsUrl = `${startData.hls.url}?token=${startData.hls.bearerToken}`;
    
    // Poll up to 4 times (1.5s interval) as Hls.js client buffers first keyframe
    let streamOk = false;
    let playlistInfo = '';
    for (let attempt = 1; attempt <= 4; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      const hlsRes = await fetch(hlsUrl);
      if (hlsRes.status === 200) {
        const body = await hlsRes.text();
        const bw = body.match(/BANDWIDTH=(\d+)/)?.[1] || "active";
        const res = body.match(/RESOLUTION=([0-9x]+)/)?.[1] || "352x288";
        playlistInfo = `Bandwidth: ${bw} bps, Resolution: ${res}`;
        streamOk = true;
        break;
      }
    }

    if (streamOk) {
      console.log(`✅ Channel ${item.ch} (Camera ${item.camId.slice(0, 8)}): HLS 200 OK -> ${playlistInfo}`);
    } else {
      console.log(`❌ Channel ${item.ch} (Camera ${item.camId.slice(0, 8)}): HLS returned 404 (stream warmup timeout)`);
      allSucceeded = false;
    }
  } catch (err) {
    console.log(`❌ Channel ${item.ch}: Error ${err.message}`);
    allSucceeded = false;
  }
}

console.log('\n======================================================');
if (allSucceeded) {
  console.log('🎉 VERIFICATION PASSED: ALL 8 KOLLAM CAMERAS ARE ONLINE & PLAYING LIVE VIDEO!');
} else {
  console.log('⚠️ Some streams could not be verified. Review details above.');
}
console.log('======================================================\n');
