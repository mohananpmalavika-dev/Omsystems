const jwt = require('jsonwebtoken');

const secret = '356c732f9f08e79b8e56315a4f65734f469dd2d350e5c072ca6634de0d0e2b57';
const token = jwt.sign(
  {
    sub: '043561dc-a162-48ca-b7e4-290a9c4ad1ff',
    tid: '00000000-0000-4000-8000-000000000001',
    role: 'super_admin'
  },
  secret,
  { expiresIn: '1h' }
);

const CONTROL_PLANE = 'https://34-14-220-41.sslip.io';
const AGENT_ID = '09181b97-0674-43ee-9d47-4b8c96f71a6b';

const cameras = [
  ['f6a5eb84-90de-4cbd-ba9d-0453855e4692', 'Ch 1'],
  ['4834618d-8cac-4f1c-a0c8-82bedcb08803', 'Ch 2'],
  ['f39e5525-3ab0-49da-8c38-b7fdff7a190c', 'Ch 3'],
  ['1a5b2602-8ae2-42c9-bd15-d3dc6fc5c5b1', 'Ch 4'],
  ['756956fe-dbdc-480f-8790-9f7e0ba52ddf', 'Ch 5'],
  ['83593346-d108-4888-b309-2b73b4bdc29e', 'Ch 6'],
  ['7ca35559-81fd-41e3-9d0d-c4855c7c217e', 'Ch 7'],
  ['5b36b23f-9c41-4103-9ad5-94f73c78ebcd', 'Ch 8'],
];

async function testCamera(camId, name) {
  try {
    const res = await fetch(`${CONTROL_PLANE}/v1/cameras/${camId}/live-sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ profile: 'sub' })
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
      console.log(`[${name}] Failed to get live session:`, res.status, data);
      return;
    }
    console.log(`[${name}] Token granted. Calling edge-live-gateway directly...`);
    // Test direct local call
    const localRes = await fetch('http://127.0.0.1:8090/v1/live/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: data.token, profile: 'sub' })
    });
    const localData = await localRes.json();
    console.log(`[${name}] Local edge response (${localRes.status}):`, JSON.stringify(localData));
  } catch (err) {
    console.error(`[${name}] Error:`, err.message);
  }
}

async function run() {
  for (const [id, name] of cameras) {
    await testCamera(id, name);
  }
}

run();
