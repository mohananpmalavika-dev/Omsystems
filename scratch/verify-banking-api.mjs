// verify-banking-api.mjs
import http from 'http';

async function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8080,
      path: path,
      method: 'GET',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000001',
        'x-user-id': '043561dc-a162-48ca-b7e4-290a9c4ad1ff',
        'x-user-roles': 'superadmin,admin',
        'authorization': 'Bearer dev-token'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Testing /api/banking/cash-counters/realtime...');
  const res1 = await testEndpoint('/api/banking/cash-counters/realtime?branchId=00000000-0000-4000-8000-000000000104');
  console.log('Status 1:', res1.statusCode);
  console.log('Body 1:', res1.data.slice(0, 200));

  console.log('\nTesting /api/banking/analytics...');
  const res2 = await testEndpoint('/api/banking/analytics?branchId=00000000-0000-4000-8000-000000000104');
  console.log('Status 2:', res2.statusCode);
  console.log('Body 2:', res2.data.slice(0, 200));
}

run().catch(console.error);
