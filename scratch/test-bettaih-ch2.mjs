const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camId = 'cb033076-8aa8-4f18-9ab5-8acf11ce28e8'; // Bettaih ch 2
const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("Bettaih ch 2 live session:", sRes.status, sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("start res:", startRes.status, startData);

if (startData.hls) {
  const hlsUrl = `${startData.hls.url}?token=${startData.hls.bearerToken}`;
  const hlsRes = await fetch(hlsUrl);
  console.log("HLS res:", hlsRes.status);
  console.log("HLS body:", await hlsRes.text());
}
