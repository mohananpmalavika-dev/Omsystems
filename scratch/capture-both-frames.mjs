import { execSync } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken } = await loginRes.json();

  const rajkotCh2 = 'ee9e189d-5bda-4ac7-a6d6-284880d98e91';
  const peravaruniCh2 = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

  async function getStream(id) {
    const sRes = await fetch(`https://35-200-130-81.sslip.io/v1/cameras/${id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: '{}'
    });
    const sData = await sRes.json();

    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: sData.token, profile: 'sub' })
    });
    const startData = await startRes.json();
    return { gw: sData.mediaGatewayUrl, hls: startData.hls };
  }

  console.log('Starting Rajkot Ch 2...');
  const rajkotStream = await getStream(rajkotCh2);
  console.log('Starting Peravaruni Ch 2...');
  const peraStream = await getStream(peravaruniCh2);

  await new Promise(r => setTimeout(r, 3000));

  console.log('Capturing frame for Rajkot Ch 2...');
  try {
    execSync(`ffmpeg -y -headers "Authorization: Bearer ${rajkotStream.hls.bearerToken}" -i "${rajkotStream.hls.url}" -frames:v 1 scratch/rajkot-ch2-live.jpg`, { stdio: 'inherit' });
    console.log('Captured scratch/rajkot-ch2-live.jpg');
  } catch (e) {
    console.error('Failed capturing Rajkot:', e.message);
  }

  console.log('Capturing frame for Peravaruni Ch 2...');
  try {
    execSync(`ffmpeg -y -headers "Authorization: Bearer ${peraStream.hls.bearerToken}" -i "${peraStream.hls.url}" -frames:v 1 scratch/peravaruni-ch2-live.jpg`, { stdio: 'inherit' });
    console.log('Captured scratch/peravaruni-ch2-live.jpg');
  } catch (e) {
    console.error('Failed capturing Peravaruni:', e.message);
  }
}

main().catch(console.error);
