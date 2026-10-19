const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const testCams = [
  { ch: 2, camId: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53' },
  { ch: 3, camId: 'da907692-01fd-4bf4-b305-f7259c05c887' }
];

for (const item of testCams) {
  console.log(`\nTesting Channel ${item.ch} (${item.camId}):`);
  const sRes = await fetch(`${base}/v1/cameras/${item.camId}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" })
  });
  const sData = await sRes.json();
  console.log("live-session res:", sRes.status, sData);

  const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: sData.token })
  });
  const startData = await startRes.json();
  console.log("start res:", startRes.status, startData);

  if (startData.hls) {
    const hlsUrl = `${startData.hls.url}?token=${startData.hls.bearerToken}`;
    console.log("Fetching HLS URL:", hlsUrl);
    const hlsRes = await fetch(hlsUrl);
    console.log("HLS res:", hlsRes.status);
    const body = await hlsRes.text();
    console.log("HLS body:", body);
  }
}
