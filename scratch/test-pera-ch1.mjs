import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const { accessToken } = await loginRes.json();

const camId = '4d3caa3d-e03d-4689-81a6-a10e6f26329c'; // Peravaruni Ch 1

const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${accessToken}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log('Stream started:', startData.hls?.url);

await new Promise(r => setTimeout(r, 3000));

try {
  execSync(`ffmpeg -y -headers "Authorization: Bearer ${startData.hls.bearerToken}" -i "${startData.hls.url}" -frames:v 1 scratch/frames/Peravaruni_Ch1.jpg`, { stdio: 'inherit' });
  const stats = fs.statSync('scratch/frames/Peravaruni_Ch1.jpg');
  console.log(`✅ Peravaruni Ch 1 captured: ${stats.size} bytes`);
} catch (e) {
  console.error('Failed:', e.message);
}
