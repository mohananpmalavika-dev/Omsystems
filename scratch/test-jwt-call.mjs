import jwt from 'jsonwebtoken';

const JWT_SECRET = '356c732f9f08e79b8e56315a4f65734f469dd2d350e5c072ca6634de0d0e2b57';
const CONTROL_PLANE_URL = 'https://34-14-220-41.sslip.io';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';

const token = jwt.sign(
  {
    sub: '043561dc-a162-48ca-b7e4-290a9c4ad1ff',
    userId: '043561dc-a162-48ca-b7e4-290a9c4ad1ff',
    email: 'superadmin@omsystems.bank',
    role: 'super_admin'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function check() {
  console.log('JWT:', token.slice(0, 30) + '...');
  const res = await fetch(`${CONTROL_PLANE_URL}/v1/branches/${BRANCH_ID}/cameras`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('HTTP status:', res.status);
  const data = await res.json();
  console.log('Cameras found:', data.data?.length);
  if (data.data) {
    for (const c of data.data) {
      console.log(`- ${c.name} (${c.id}): status=${c.status}, transport=${c.connectionTransport}, agent=${c.edgeAgentId}`);
    }
  }
}
check();
