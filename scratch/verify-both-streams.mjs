import { execSync } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  console.log('--- Step 1: Login ---');
  const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken } = await loginRes.json();
  console.log('Logged in successfully.');

  const rajkotCh2 = 'ee9e189d-5bda-4ac7-a6d6-284880d98e91';
  const peravaruniCh2 = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

  async function getStreamInfo(name, id) {
    console.log(`\nStarting live session for ${name}...`);
    const sessionRes = await fetch(`https://35-200-130-81.sslip.io/v1/cameras/${id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: '{}'
    });
    const sessionData = await sessionRes.json();
    console.log(`${name} Gateway: ${sessionData.mediaGatewayUrl}`);

    const startRes = await fetch(`${sessionData.mediaGatewayUrl}/v1/live/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: sessionData.token, profile: 'sub' })
    });
    const startData = await startRes.json();
    console.log(`${name} Start status: ${startRes.status}, Path: ${startData.path}`);

    // Wait 2 seconds for HLS to generate
    await new Promise(r => setTimeout(r, 2000));

    const hlsRes = await fetch(startData.hls.url, {
      headers: { Authorization: `Bearer ${startData.hls.bearerToken}` }
    });
    console.log(`${name} HLS status: ${hlsRes.status}`);
    const hlsBody = await hlsRes.text();
    console.log(`${name} Playlist snippet:`, hlsBody.split('\n').slice(0, 5).join(' '));

    return { sessionData, startData, hlsBody };
  }

  const rajkot = await getStreamInfo('Rajkot Channel 2', rajkotCh2);
  const pera = await getStreamInfo('Peravaruni Channel 2', peravaruniCh2);

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log('Rajkot Ch 2 Agent:', rajkot.sessionData.mediaGatewayUrl);
  console.log('Rajkot Ch 2 Path:', rajkot.startData.path);
  console.log('Peravaruni Ch 2 Agent:', pera.sessionData.mediaGatewayUrl);
  console.log('Peravaruni Ch 2 Path:', pera.startData.path);
}

main().catch(console.error);
