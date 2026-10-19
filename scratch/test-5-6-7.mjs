const base = "https://35-200-130-81.sslip.io";

const testCameras = [
  { ch: 5, camId: '9cf710ef-1a0b-444b-9c30-abbac95948fe' },
  { ch: 6, camId: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' },
  { ch: 7, camId: '3baa601f-67e0-4e0e-905d-0688df725bf1' }
];

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" }),
  signal: AbortSignal.timeout(10000)
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

for (const item of testCameras) {
  console.log(`\nTesting Ch ${item.ch}...`);
  const sRes = await fetch(`${base}/v1/cameras/${item.camId}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" }),
    signal: AbortSignal.timeout(15000)
  });
  const sData = await sRes.json();
  if (!sData.token || !sData.mediaGatewayUrl) {
    console.log(`Ch ${item.ch} session error:`, sData);
    continue;
  }

  const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: sData.token }),
    signal: AbortSignal.timeout(20000)
  });
  const startData = await startRes.json();
  console.log(`Ch ${item.ch} startRes:`, startRes.status, startData.path);

  // Poll for HLS
  let success = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`, {
        signal: AbortSignal.timeout(5000)
      });
      console.log(`  [Attempt ${attempt}] HLS: ${hlsRes.status}`);
      if (hlsRes.status === 200) {
        const text = await hlsRes.text();
        const bw = text.match(/BANDWIDTH=(\d+)/)?.[1] || "ok";
        console.log(`  ✅ Ch ${item.ch} SUCCESS! Bandwidth: ${bw}`);
        success = true;
        break;
      }
    } catch (e) {
      console.log(`  [Attempt ${attempt}] Error: ${e.message}`);
    }
  }
}
