const CONTROL_PLANE_URL = 'https://34-14-220-41.sslip.io';

async function checkDetails() {
  const loginRes = await fetch(`${CONTROL_PLANE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const { accessToken: token } = await loginRes.json();

  // Check gateways
  console.log('=== EDGE GATEWAYS ===');
  const gwRes = await fetch(`${CONTROL_PLANE_URL}/v1/edge-gateways`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const gateways = (await gwRes.json()).data || [];
  for (const g of gateways) {
    console.log(`ID: ${g.id} | Name: "${g.name}" | Status: ${g.status} | Branch: ${g.branchId || g.organizationNodeId} | Updated: ${g.updatedAt} | Mode: ${g.tunnelMode} | PublicUrl: ${g.publicUrl}`);
  }

  // Check cameras
  console.log('\n=== CAMERAS & THEIR ASSIGNED GATEWAYS ===');
  const camRes = await fetch(`${CONTROL_PLANE_URL}/v1/cameras`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const cameras = (await camRes.json()).data || [];
  for (const c of cameras) {
    console.log(`Camera: "${c.name}" (${c.id}) -> Assigned Gateway: ${c.edgeGatewayId} | Status: ${c.status} | StreamUrl: ${c.streamUrl}`);
  }
}

checkDetails().catch(console.error);
