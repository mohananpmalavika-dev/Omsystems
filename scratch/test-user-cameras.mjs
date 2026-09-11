async function testUserCameras() {
  const loginRes = await fetch('http://3.7.216.169:8080/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;

  const camRes = await fetch('http://3.7.216.169:8080/v1/cameras', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const camData = await camRes.json();
  console.log('Total cameras returned for test:', camData.data?.length);
  for (const cam of (camData.data || [])) {
    console.log(` - Camera: ${cam.name} (${cam.id}), branchId: ${cam.branchId || cam.organizationNodeId}`);
  }

  // Also check super_admin
  const adminRes = await fetch('http://3.7.216.169:8080/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password@123' }),
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.accessToken;
  const adminTreeRes = await fetch('http://3.7.216.169:8080/v1/organization/tree', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminTree = await adminTreeRes.json();
  console.log('Superadmin tree root count:', adminTree.data?.length);
}

testUserCameras().catch(console.error);
