async function inspect(host, name) {
  console.log(`\n=================== ${name} (${host}) ===================`);
  const loginRes = await fetch(`${host}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' }),
  });
  const { accessToken } = await loginRes.json();
  if (!accessToken) {
    console.log('Login failed');
    return;
  }
  
  const nodesRes = await fetch(`${host}/v1/organization/nodes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const nodes = (await nodesRes.json()).data || [];
  console.log(`Visible nodes (${nodes.length}):`);
  for (const n of nodes) {
    console.log(` - [${n.type}] ${n.name} (id: ${n.id}, parent: ${n.parentId})`);
  }

  const camRes = await fetch(`${host}/v1/cameras`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const cams = (await camRes.json()).data || [];
  console.log(`Cameras (${cams.length}):`);
  for (const c of cams) {
    console.log(` - [${c.status}] ${c.name} (id: ${c.id}, branch: ${c.branchId})`);
  }
}

async function run() {
  await inspect('http://3.7.216.169:8080', 'AWS');
  await inspect('https://34-14-220-41.sslip.io', 'GCP');
}
run();
