const base = "https://35-200-130-81.sslip.io";

console.log("1. Logging in...");
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

console.log("2. Requesting live session...");
const sessionRes = await fetch(`${base}/v1/cameras/b7a24b40-013d-40c9-bd46-823cbcf6e326/live-sessions`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "authorization": `Bearer ${token}`
  },
  body: JSON.stringify({ profile: "sub" })
});
const sessionData = await sessionRes.json();

console.log("3. Calling /v1/live/start...");
const startRes = await fetch(`${sessionData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sessionData.token })
});
const startData = await startRes.json();
console.log("HLS URL:", startData.hls.url);
console.log("Bearer Token:", startData.hls.bearerToken);

console.log("\n4. Fetching HLS index.m3u8 with Authorization header...");
const hlsRes1 = await fetch(startData.hls.url, {
  headers: {
    "Authorization": `Bearer ${startData.hls.bearerToken}`
  }
});
console.log("HLS with Auth Header status:", hlsRes1.status);
console.log("HLS response body:\n", await hlsRes1.text());

console.log("\n5. Fetching HLS index.m3u8 with ?token= query param (which video player Hls.js does)...");
const hlsRes2 = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("HLS with Query Param status:", hlsRes2.status);
console.log("HLS response body:\n", await hlsRes2.text());

console.log("\n6. Fetching HLS index.m3u8 WITHOUT token (what happened in user error trace)...");
const hlsRes3 = await fetch(startData.hls.url);
console.log("HLS without token status:", hlsRes3.status);
console.log("HLS response body:\n", await hlsRes3.text());
