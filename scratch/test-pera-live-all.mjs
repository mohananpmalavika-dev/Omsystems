import { execSync } from 'node:child_process';

const base = "https://35-200-130-81.sslip.io";

async function testPera() {
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;

  const cams = [
    { ch: 1, camId: '4d3caa3d-e03d-4689-81a6-a10e6f26329c' },
    { ch: 2, camId: 'a66bbc0b-1d47-4462-9cf7-94b5b35824df' },
    { ch: 3, camId: '940fb6f4-7c41-4c92-b4f1-85a459ebb38d' },
    { ch: 4, camId: '1fa8cd44-c782-40a3-81f2-a933fb2b1d76' },
    { ch: 5, camId: '9cf710ef-1a0b-444b-9c30-abbac95948fe' },
    { ch: 6, camId: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8' },
    { ch: 7, camId: '3baa601f-67e0-4e0e-905d-0688df725bf1' },
    { ch: 8, camId: '14d869da-4642-4d74-9de0-c4c6c2be4488' },
  ];

  for (const c of cams) {
    try {
      const sRes = await fetch(`${base}/v1/cameras/${c.camId}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.token || !sData.mediaGatewayUrl) {
        console.log(`❌ PERAVARUNI Ch ${c.ch}: session error`, sData);
        continue;
      }

      const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: sData.token })
      });
      const startData = await startRes.json();
      if (startRes.status !== 201 || !startData.hls) {
        console.log(`❌ PERAVARUNI Ch ${c.ch}: start error`, startRes.status, startData);
        continue;
      }

      console.log(`✅ PERAVARUNI Ch ${c.ch}: LIVE STREAM STARTED & OK!`);
    } catch (e) {
      console.log(`❌ PERAVARUNI Ch ${c.ch}: exception ${e.message}`);
    }
  }
}

testPera();
