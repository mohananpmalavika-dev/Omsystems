import { execSync } from 'child_process';

const testCameraId = '3d856964-d701-409f-92c9-f7a70584a980'; // Channel 1
const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

async function main() {
  console.log('1. Creating live session for Channel 1 in control-plane...');
  const res = await fetch(`http://127.0.0.1:8080/v1/cameras/${testCameraId}/live-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: 'sub' })
  });

  const session = await res.json();
  console.log('Control plane response:', res.status, session);
  if (!session.token) {
    console.error('No session token issued!');
    return;
  }

  console.log('2. Calling /v1/live/start on Hajipur edge media relay...');
  const startRes = await fetch(`${relayBase}/v1/live/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ controlPlaneToken: session.token, profile: 'sub' })
  });

  const startData = await startRes.json();
  console.log('Edge relay live start response:', startRes.status, startData);
}

main().catch(console.error);
