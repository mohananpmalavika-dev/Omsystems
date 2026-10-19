import { execSync } from 'node:child_process';

async function main() {
  const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken } = await loginRes.json();
  console.log('Logged in successfully.');

  // Camera 2 of Peravaruni
  const camId = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';

  const sessionRes = await fetch(`https://35-200-130-81.sslip.io/v1/cameras/${camId}/live-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: '{}'
  });
  const sessionData = await sessionRes.json();
  console.log('Session response:', sessionData);

  if (sessionData.token) {
    const startRes = await fetch('https://35-200-130-81.sslip.io/v1/live/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: sessionData.token })
    });
    console.log('Start status:', startRes.status);
    const startData = await startRes.json().catch(async () => await startRes.text());
    console.log('Start data:', startData);
  }
}

main().catch(console.error);
