async function testUserOrgs() {
  console.log('Logging in as test...');
  const loginRes = await fetch('http://3.7.216.169:8080/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test', password: 'test@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Token acquired. Fetching /v1/organization/tree...');

  const treeRes = await fetch('http://3.7.216.169:8080/v1/organization/tree', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const treeData = await treeRes.json();
  console.log('Tree data root count:', treeData.data?.length);
  console.log('Root companies returned in tree:');
  for (const node of (treeData.data || [])) {
    console.log(` - [${node.type}] ${node.name} (${node.id})`);
  }

  console.log('\nFetching /v1/organization/nodes...');
  const nodesRes = await fetch('http://3.7.216.169:8080/v1/organization/nodes', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const nodesData = await nodesRes.json();
  console.log('Total visible nodes returned:', nodesData.data?.length);
  for (const node of (nodesData.data || [])) {
    if (node.type === 'company') {
      console.log(` - Company: ${node.name} (${node.id})`);
    }
  }
}

testUserOrgs().catch(console.error);
