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
  console.log("=== 1. Login as Superadmin mgdhanyamohan ===");
  const adminLogin = await post('/v1/auth/login', {
    username: 'mgdhanyamohan',
    password: 'SentinelMasterAdmin2026!'
  });
  const adminToken = adminLogin.body.accessToken;
  console.log("Superadmin token received:", Boolean(adminToken));

  console.log("\n=== 2. Superadmin Org Tree ===");
  const adminTree = await get('/v1/organization/tree', adminToken);
  console.log("Admin Tree root count:", adminTree.body?.data?.length);
  function printTree(nodes, indent = "") {
    for (const n of (nodes || [])) {
      console.log(`${indent}* [${n.nodeType}] ${n.name} (${n.id})`);
      if (n.children && n.children.length > 0) {
        printTree(n.children, indent + "  ");
      }
    }
  }
  printTree(adminTree.body?.data);

  console.log("\n=== 3. Superadmin Branches (via /v1/organization/nodes?type=branch) ===");
  const adminBranches = await get('/v1/organization/nodes?type=branch', adminToken);
  console.log("Total branches for Superadmin:", adminBranches.body?.data?.length);
  adminBranches.body?.data?.forEach(b => console.log(` - ${b.name} (${b.id})`));

  console.log("\n=== 4. Superadmin Cameras (via /v1/cameras) ===");
  const adminCameras = await get('/v1/cameras', adminToken);
  console.log("Total cameras for Superadmin:", Array.isArray(adminCameras.body) ? adminCameras.body.length : adminCameras.body?.data?.length || adminCameras.body?.cameras?.length);

  console.log("\n=== 5. Login as BASANTH (Operator assigned strictly to 'south' branch) ===");
  const basanthLogin = await post('/v1/auth/login', {
    username: 'BASANTH',
    password: 'SentinelMasterAdmin2026!'
  });
  console.log("basanthLogin response:", basanthLogin);
  const basanthToken = basanthLogin.body?.accessToken;
  console.log("BASANTH login success:", Boolean(basanthToken));

  console.log("\n=== 6. BASANTH Org Tree ===");
  const basanthTree = await get('/v1/organization/tree', basanthToken);
  console.log("BASANTH Tree data:", JSON.stringify(basanthTree.body, null, 2));

  console.log("\n=== 7. BASANTH Branches (via /v1/organization/nodes?type=branch) ===");
  const basanthBranches = await get('/v1/organization/nodes?type=branch', basanthToken);
  console.log("Total branches visible to BASANTH:", basanthBranches.body?.data?.length);
  basanthBranches.body?.data?.forEach(b => console.log(` - ${b.name} (${b.id})`));

  console.log("\n=== 8. BASANTH Fleet Branches (via /v1/operations/branches) ===");
  const basanthFleet = await get('/v1/operations/branches', basanthToken);
  console.log("Total fleet branches visible to BASANTH:", basanthFleet.body?.data?.length);
  basanthFleet.body?.data?.forEach(b => console.log(` - ${b.name} (${b.id})`));

  console.log("\n=== 9. BASANTH Cameras (via /v1/cameras) ===");
  const basanthCameras = await get('/v1/cameras', basanthToken);
  const camList = Array.isArray(basanthCameras.body) ? basanthCameras.body : (basanthCameras.body?.data || basanthCameras.body?.cameras || []);
  console.log("Total cameras visible to BASANTH:", camList.length);
  camList.forEach(c => console.log(` - Camera: ${c.name} (${c.id}) at branch: ${c.branchId || c.resourceNodeId}`));

  console.log("\n=== 10. Login as admin (Role: security_officer assigned strictly to 'south' branch) ===");
  const userAdminLogin = await post('/v1/auth/login', {
    username: 'admin',
    password: 'SentinelMasterAdmin2026!'
  });
  const adminUserToken = userAdminLogin.body?.accessToken;
  console.log("admin login success:", Boolean(adminUserToken), "role:", userAdminLogin.body?.user?.role);

  console.log("\n=== 11. admin Branches (via /v1/organization/nodes?type=branch) ===");
  const adminUserBranches = await get('/v1/organization/nodes?type=branch', adminUserToken);
  console.log("Total branches visible to admin:", adminUserBranches.body?.data?.length);
  adminUserBranches.body?.data?.forEach(b => console.log(` - ${b.name} (${b.id})`));

  console.log("\n=== 12. admin Cameras (via /v1/cameras) ===");
  const adminUserCameras = await get('/v1/cameras', adminUserToken);
  const adminCamList = Array.isArray(adminUserCameras.body) ? adminUserCameras.body : (adminUserCameras.body?.data || adminUserCameras.body?.cameras || []);
  console.log("Total cameras visible to admin:", adminCamList.length);
  adminCamList.forEach(c => console.log(` - Camera: ${c.name} (${c.id}) at branch: ${c.branchId || c.resourceNodeId}`));
}

run().catch(console.error);
