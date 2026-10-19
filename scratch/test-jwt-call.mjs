import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET must be supplied through the environment.");
const CONTROL_PLANE_URL = 'https://35-200-130-81.sslip.io';
const BRANCH_ID = '6ddee070-9050-4f55-aaa1-1190654bbc6b';

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
  console.log('Fetching cameras for Branch Rajkot...');
  const res = await fetch(`${CONTROL_PLANE_URL}/v1/branches/${BRANCH_ID}/cameras`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('HTTP status:', res.status);
  const data = await res.json();
  const list = data.data || data.cameras || data;
  console.log('Cameras found:', Array.isArray(list) ? list.length : list);
  if (Array.isArray(list)) {
    for (const c of list) {
      console.log(`- ${c.name || c.model} (${c.id}): channel=${c.channel}, status=${c.status}, transport=${c.connectionTransport}, ip=${c.ipAddress}`);
    }
  }
}
check();
