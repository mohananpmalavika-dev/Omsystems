const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camId = 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53'; // Kollam ch 2
const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("start status:", startRes.status);

const hlsUrl = `${startData.hls.url}?token=${startData.hls.bearerToken}`;

for (let i = 1; i <= 8; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const hlsRes = await fetch(hlsUrl);
  console.log(`Attempt ${i}: status ${hlsRes.status}`);
  if (hlsRes.status === 200) {
    const text = await hlsRes.text();
    console.log("SUCCESS! HLS Playlist:\n", text);
    break;
  }
}
