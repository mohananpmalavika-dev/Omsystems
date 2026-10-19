async function testLogin(host) {
  console.log(`\n=================== Testing Host: ${host} ===================`);
  try {
    const loginRes = await fetch(`${host}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test@123' }),
    });
    console.log(`Login status: ${loginRes.status}`);
    const loginData = await loginRes.json();
    if (!loginData.accessToken) {
      console.log('Login failed:', loginData);
      return;
    }
    const token = loginData.accessToken;
    console.log('Login success! User:', loginData.user?.username, 'Role:', loginData.user?.role);

    // Fetch cameras
    const camRes = await fetch(`${host}/v1/cameras`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`Cameras status: ${camRes.status}`);
    const camData = await camRes.json();
    const cameras = camData.data || camData.cameras || camData || [];
    console.log(`Total cameras returned: ${cameras.length}`);
    
    let onlineCount = 0;
    let offlineCount = 0;
    for (const c of cameras) {
      const isOnline = c.status === 'online' || c.isOnline === true;
      if (isOnline) onlineCount++;
      else offlineCount++;
    }
    console.log(`Status breakdown: Online: ${onlineCount}, Offline/Other: ${offlineCount}`);
    
    // Sample cameras
    cameras.slice(0, 10).forEach(c => {
      console.log(` - [${c.status}] ${c.name || c.model} (id: ${c.id}, branch: ${c.branchId || c.branch_node_id || c.branchName || c.organizationNodeId})`);
    });

  } catch (err) {
    console.error(`Error on ${host}:`, err.message);
  }
}

async function run() {
  await testLogin('https://35-200-130-81.sslip.io');
  await testLogin('https://3-7-216-169.sslip.io');
  await testLogin('http://3.7.216.169:8080');
}

run();
