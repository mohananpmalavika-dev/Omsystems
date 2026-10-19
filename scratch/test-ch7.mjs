const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" }),
  signal: AbortSignal.timeout(10000)
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camId = '3baa601f-67e0-4e0e-905d-0688df725bf1'; // Ch 7
const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("Ch 7 session:", sData);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("Ch 7 startRes:", startRes.status, startData);

// Wait 2 seconds
await new Promise(r => setTimeout(r, 2000));
const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("Ch 7 HLS status:", hlsRes.status);
if (hlsRes.status === 200) {
  console.log("Ch 7 HLS body:\n", await hlsRes.text());
}
