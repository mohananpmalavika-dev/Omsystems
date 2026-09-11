async function testLoginAndFetch() {
  const url = 'https://3-7-216-169.sslip.io/api/control/v1/auth/login';
  console.log('Logging in as test user...');
  const loginRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' }), // or test user
  });
  console.log('Login status:', loginRes.status);
  const data = await loginRes.json();
  console.log('Login response keys:', Object.keys(data));
  if (data.accessToken) {
    console.log('Access token obtained. Testing command center & branches with token...');
    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    console.log('Set-Cookie received:', cookieHeader.split(';')[0]);

    // Test branches
    const bStart = Date.now();
    const branchesRes = await fetch('https://3-7-216-169.sslip.io/api/control/v1/operations/branches', {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
        'x-sentinel-session': data.accessToken,
      }
    });
    console.log(`[${branchesRes.status}] GET /api/control/v1/operations/branches (${Date.now() - bStart}ms)`);

    // Test command center
    const cStart = Date.now();
    const ccRes = await fetch('https://3-7-216-169.sslip.io/api/control/v1/operations/command-center', {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
        'x-sentinel-session': data.accessToken,
      }
    });
    console.log(`[${ccRes.status}] GET /api/control/v1/operations/command-center (${Date.now() - cStart}ms)`);

    // Test alerts
    const aStart = Date.now();
    const alertsRes = await fetch('https://3-7-216-169.sslip.io/v1/operations/alerts?status=active&limit=50', {
      headers: {
        'Authorization': `Bearer ${data.accessToken}`,
        'x-sentinel-session': data.accessToken,
      }
    });
    console.log(`[${alertsRes.status}] GET /v1/operations/alerts?status=active&limit=50 (${Date.now() - aStart}ms)`);
  }
}

testLoginAndFetch();
