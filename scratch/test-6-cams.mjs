const base = 'https://35-200-130-81.sslip.io';
const loginRes = await fetch(base + '/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test@123' })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const testCams = [
  { name: 'Hajipur Ch 2', id: '25175a3f-562e-4138-a827-91518096937e' },
  { name: 'Hajipur Ch 3', id: '5ffde9b3-924c-4622-aa74-b3c406567d7c' },
  { name: 'Hajipur Ch 4', id: '80ce1672-d553-4e85-b2e4-3758bd744eb4' },
  { name: 'KOLLAM Ch 3', id: 'da907692-01fd-4bf4-b305-f7259c05c887' },
  { name: 'KOLLAM Ch 8', id: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d' },
  { name: 'PERAVARUNI Ch 5', id: '9cf710ef-1a0b-444b-9c30-abbac95948fe' }
];

for (const c of testCams) {
  try {
    const sRes = await fetch(`${base}/v1/cameras/${c.id}/live-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({ profile: 'sub' })
    });
    const sData = await sRes.json();
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    console.log(c.name, startRes.status === 201 && startData.hls ? '✅ Live OK' : '❌ Failed: ' + startRes.status);
  } catch (err) {
    console.log(c.name, '❌ Error: ' + err.message);
  }
}
