const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

// Bettaih Ch 1
const camBettaih = '71c48e75-4e0b-4536-b3e4-85263a6d98ad';
const s1 = await (await fetch(`${base}/v1/cameras/${camBettaih}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
})).json();

const start1 = await (await fetch(`${s1.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: s1.token })
})).json();

console.log("Bettaih start1:", start1);
const hls1 = await fetch(`${start1.hls.url}?token=${start1.hls.bearerToken}`);
console.log("Bettaih HLS status:", hls1.status);

// Now let's see what happens if we test peravaruni-ch1 that already exists on 748e:
// In our query earlier:
// edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1 exists!
// Let's set Peravaruni Ch 1 camera to use edge://748eeb31-76f8-43e9-9121-4c1d99166e87/peravaruni-ch1
