const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const testCameras = [
  { branch: "Bettaih", id: "574ec320-ad4a-4c40-9a6d-76fa7cf7d13c" }, // ch 1
  { branch: "Hajipur", id: "71c48e75-4e0b-4536-b3e4-85263a6d98ad" }, // ch 1
  { branch: "PERAVARUNI", id: "13bb2cba-6d43-4877-a4c0-f13a26d21d7b" }, // ch 1
  { branch: "Rajkot", id: "046a42fe-8799-447f-a250-66660cfdfeac" } // ch 1
];

for (const cam of testCameras) {
  try {
    console.log(`\nTesting ${cam.branch} (${cam.id})...`);
    const sRes = await fetch(`${base}/v1/cameras/${cam.id}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    console.log(`  mediaGatewayUrl:`, sData.mediaGatewayUrl);
    if (!sData.token || !sData.mediaGatewayUrl) {
      console.log(`  no token or mediaGatewayUrl!`, sData);
      continue;
    }
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    console.log(`  start status: ${startRes.status}`);
    if (startData.hls) {
      const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
      console.log(`  HLS status: ${hlsRes.status}`);
      const body = await hlsRes.text();
      console.log(`  HLS response:`, body.slice(0, 100));
    }
  } catch (err) {
    console.log(`  Error on ${cam.branch}:`, err.message);
  }
}
