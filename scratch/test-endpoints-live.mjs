import https from 'https';

async function checkEndpoint(path, method = 'GET', authHeader = null) {
  const url = `https://3-7-216-169.sslip.io${path}`;
  const start = Date.now();
  try {
    const headers = {
      ...(authHeader ? { 'authorization': authHeader } : {}),
      'x-tenant-id': 'tenant-test-system',
    };
    const res = await fetch(url, { method, headers, redirect: 'manual' });
    const elapsed = Date.now() - start;
    const location = res.headers.get('location') || '';
    console.log(`[${res.status}] ${method} ${path} -> Location: "${location}" (${elapsed}ms)`);
    return { status: res.status, location, elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`[ERR] ${method} ${path} (${elapsed}ms):`, err.message);
    return { status: 0, elapsed, error: err.message };
  }
}

async function run() {
  console.log('Testing redirect on https://3-7-216-169.sslip.io ...');
  await checkEndpoint('/');
  await checkEndpoint('/command-center');
  await checkEndpoint('/branches');
  await checkEndpoint('/login');
}

run();
