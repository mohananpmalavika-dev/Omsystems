const CONTROL_PLANE_URL = 'https://34-14-220-41.sslip.io';
const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';

async function testAll() {
  const res = await fetch(`${CONTROL_PLANE_URL}/v1/branches/${BRANCH_ID}/cameras`, {
    headers: { 'x-user-id': DEV_USER_ID }
  });
  console.log('HTTP status:', res.status);
  const text = await res.text();
  console.log('Response body:', text);
}
testAll();
