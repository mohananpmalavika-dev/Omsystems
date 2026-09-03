const http = require('http');

async function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: '3.7.216.169',
      port: 8080,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '3.7.216.169',
      port: 8080,
      path,
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log("=== 1. Login as Superadmin ===");
  const adminLogin = await post('/v1/auth/login', {
    username: 'mgdhanyamohan',
    password: 'SentinelMasterAdmin2026!'
  });
  const superToken = adminLogin.body.accessToken;

  console.log("\n=== 2. Assigning user 'admin' to Zone 'Operations' (id: 00000000-0000-4000-8000-000000000102) ===");
  const assignRes = await post('/v1/users/7ec48f5b-0909-464c-a258-9e5c86c2e480/organizations', {
    scopeNodeId: '00000000-0000-4000-8000-000000000102',
    isPrimary: true,
    replaceExisting: true
  }, superToken);
  console.log("Assignment response status:", assignRes.status);

  console.log("\n=== 3. Login as user 'admin' ===");
  const userLogin = await post('/v1/auth/login', {
    username: 'admin',
    password: 'SentinelMasterAdmin2026!'
  });
  const userToken = userLogin.body.accessToken;

  console.log("\n=== 4. Checking branches visible to user 'admin' scoped to Zone 'Operations' ===");
  const branches = await get('/v1/organization/nodes?type=branch', userToken);
  console.log("Visible branches count:", branches.body?.data?.length);
  branches.body?.data?.forEach(b => console.log(` - Branch: ${b.name} (${b.id})`));

  console.log("\n=== 5. Checking cameras visible to user 'admin' scoped to Zone 'Operations' ===");
  const cameras = await get('/v1/cameras', userToken);
  const camList = Array.isArray(cameras.body) ? cameras.body : (cameras.body?.data || cameras.body?.cameras || []);
  console.log("Visible cameras count:", camList.length);
  camList.forEach(c => console.log(` - Camera: ${c.name} at branch: ${c.branchId || c.resourceNodeId}`));

  console.log("\n=== 6. Restoring user 'admin' back to branch 'south' ===");
  const restoreRes = await post('/v1/users/7ec48f5b-0909-464c-a258-9e5c86c2e480/organizations', {
    scopeNodeId: '64aae3f1-36bd-4d04-8779-a6a225aec647',
    isPrimary: true,
    replaceExisting: true
  }, superToken);
  console.log("Restore assignment response status:", restoreRes.status);

  const restoredBranches = await get('/v1/organization/nodes?type=branch', userToken);
  console.log("Restored visible branches count:", restoredBranches.body?.data?.length);
  restoredBranches.body?.data?.forEach(b => console.log(` - Branch: ${b.name}`));
}

run().catch(console.error);
