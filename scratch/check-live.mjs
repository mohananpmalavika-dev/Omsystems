const CONTROL_PLANE_URL = 'https://34-14-220-41.sslip.io';

async function diagnose() {
  console.log('--- Step 1: Login ---');
  const loginRes = await fetch(`${CONTROL_PLANE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login OK. User:', loginData.user.username, 'Tenant:', loginData.user.tenantId);

  console.log('\n--- Step 2: Fetch Organization Tree & Branches ---');
  const treeRes = await fetch(`${CONTROL_PLANE_URL}/v1/organization/tree`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const treeData = await treeRes.json();
  console.log('Tree root nodes:', treeData.data?.length);

  console.log('\n--- Step 3: Fetch Cameras ---');
  const camRes = await fetch(`${CONTROL_PLANE_URL}/v1/cameras`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const camData = await camRes.json();
  console.log('Total cameras:', camData.data?.length);
  const cameras = camData.data || [];
  for (const c of cameras) {
    console.log(`\nCamera: "${c.name}" (${c.id})`);
    console.log(`  Status: ${c.status}, StreamStatus: ${c.streamStatus}, HealthStatus: ${c.healthStatus}`);
    console.log(`  IP: ${c.ipAddress}, Port: ${c.port}, StreamUrl: ${c.streamUrl}`);
    console.log(`  GatewayId: ${c.edgeGatewayId}, BranchId: ${c.branchId || c.organizationNodeId}`);
    console.log(`  RecorderId: ${c.recorderId}, RecorderChannel: ${c.recorderChannel}`);
  }

  console.log('\n--- Step 4: Fetch Edge Gateways ---');
  // Check edge gateways endpoint if available
  const gwRes = await fetch(`${CONTROL_PLANE_URL}/v1/edge-gateways`, {
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => null);
  if (gwRes && gwRes.ok) {
    const gwData = await gwRes.json();
    console.log('Edge Gateways count:', gwData.data?.length);
    for (const g of (gwData.data || [])) {
      console.log(`Gateway: "${g.name}" (${g.id}) | Status: ${g.status} | Branch: ${g.branchId || g.organizationNodeId} | LastHeartbeat: ${g.lastHeartbeatAt || g.updatedAt} | PublicUrl: ${g.publicUrl} | Mode: ${g.tunnelMode}`);
    }
  } else {
    console.log('Edge gateways endpoint returned:', gwRes?.status);
  }

  console.log('\n--- Step 5: Test Live Session for each camera ---');
  for (const c of cameras) {
    console.log(`\nRequesting live session for "${c.name}" (${c.id})...`);
    const sessionRes = await fetch(`${CONTROL_PLANE_URL}/v1/cameras/${c.id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: '{}'
    });
    console.log('Session response status:', sessionRes.status);
    const sessionData = await sessionRes.json().catch(() => null);
    console.log('Session response body:', JSON.stringify(sessionData));

    if (sessionRes.ok && sessionData?.token) {
      const gwUrl = sessionData.mediaGatewayUrl || 'https://34-14-220-41.sslip.io';
      console.log(`Attempting /v1/live/start at ${gwUrl}...`);
      const startRes = await fetch(`${gwUrl}/v1/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlPlaneToken: sessionData.token })
      }).catch(err => ({ ok: false, status: 0, text: async () => err.message }));
      
      console.log('/v1/live/start status:', startRes.status);
      console.log('/v1/live/start text:', await startRes.text());
    }
  }
}

diagnose().catch(console.error);
