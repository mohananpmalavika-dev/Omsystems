import { execSync } from 'node:child_process';

async function main() {
  const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken } = await loginRes.json();
  console.log('Logged in successfully as test.');

  const rajkotCh2 = 'ee9e189d-5bda-4ac7-a6d6-284880d98e91';
  const peravaruniCh2 = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

  async function testCamera(name, id) {
    console.log(`\n--- Testing ${name} (${id}) ---`);
    const sessionRes = await fetch(`https://35-200-130-81.sslip.io/v1/cameras/${id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: '{}'
    });
    console.log(`Session status: ${sessionRes.status}`);
    const sessionData = await sessionRes.json();
    console.log('Session response:', sessionData);

    if (!sessionData.token) return;

    const gwUrl = sessionData.mediaGatewayUrl || 'https://35-200-130-81.sslip.io';
    console.log(`Calling ${gwUrl}/v1/live/start...`);
    const startRes = await fetch(`${gwUrl}/v1/live/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: sessionData.token, profile: 'sub' })
    });
    console.log(`Start status: ${startRes.status}`);
    const startData = await startRes.json().catch(async () => await startRes.text());
    console.log('Start data:', startData);

    if (startData?.hls?.url) {
      console.log(`Checking HLS URL: ${startData.hls.url}...`);
      await new Promise(r => setTimeout(r, 2000));
      const hlsRes = await fetch(startData.hls.url, {
        headers: { Authorization: `Bearer ${startData.hls.bearerToken}` }
      });
      console.log(`HLS status: ${hlsRes.status}`);
      const hlsText = await hlsRes.text();
      console.log('HLS response snippet:\n', hlsText.slice(0, 300));
    }
  }

  await testCamera('Rajkot Channel 2', rajkotCh2);
  await testCamera('Peravaruni Channel 2', peravaruniCh2);
}

main().catch(console.error);
