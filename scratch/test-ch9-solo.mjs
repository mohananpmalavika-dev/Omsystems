const base = "https://35-200-130-81.sslip.io";

async function main() {
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken || loginData.token;

  const ch9Id = '3c2101f3-4569-4083-8eef-e27670e26a14';
  console.log('Testing Channel 9 in isolation...');

  const sRes = await fetch(`${base}/v1/cameras/${ch9Id}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" })
  });
  const sData = await sRes.json();
  console.log('Channel 9 live session response:', sRes.status, sData);

  if (sData.token && sData.mediaGatewayUrl) {
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    console.log('Channel 9 live/start status:', startRes.status, startData);

    if (startData.hls) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(r => setTimeout(r, 800));
        const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
        console.log(`HLS attempt ${attempt}: status ${hlsRes.status}`);
        if (hlsRes.status === 200) {
          console.log('HLS manifest:\n', await hlsRes.text());
          break;
        }
      }
    }
  }
}

main().catch(console.error);
