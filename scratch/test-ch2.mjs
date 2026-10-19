const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camId = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df'; // Peravaruni Ch 2
console.log("Fetching live session for Ch 2...");
const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" }),
  signal: AbortSignal.timeout(10000)
});
const sData = await sRes.json();
console.log("Live session result:", sData);

console.log("Calling live/start for Ch 2...");
const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token }),
  signal: AbortSignal.timeout(10000)
});
const startData = await startRes.json();
console.log("startRes result:", startRes.status, startData);
