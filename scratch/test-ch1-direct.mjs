const base = "https://35-200-130-81.sslip.io";
const camId = 'b7a24b40-013d-40c9-bd46-823cbcf6e326'; // Kollam ch 1

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("Live session:", sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("Start status:", startRes.status, startData);

const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("HLS Status:", hlsRes.status);
console.log("HLS Body:", (await hlsRes.text()).slice(0, 150));
