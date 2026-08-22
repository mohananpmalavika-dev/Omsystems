import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const testPassword = process.env.TEST_PASSWORD;
if (!testPassword) throw new Error('TEST_PASSWORD is required');

try {
  console.log('🔍 Testing login with tenant slug\n');

// Test 1: Without tenant slug
console.log('Test 1: Login WITHOUT tenant slug');
const query1 = `
  SELECT u.username, u.password_hash, u.status, t.slug as tenant_slug
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE LOWER(u.username) = LOWER($1)
    AND ($2::text IS NULL OR t.slug = $2)
  LIMIT 1
`;

const result1 = await pool.query(query1, ['mgdhanyamohan', null]);
console.log('Found:', result1.rows.length > 0 ? 'YES' : 'NO');
if (result1.rows.length > 0) {
  const user = result1.rows[0];
  console.log('  Username:', user.username);
  console.log('  Tenant Slug:', user.tenant_slug);
  console.log('  Status:', user.status);
  const valid = await bcrypt.compare(testPassword, user.password_hash);
  console.log('  Password valid:', valid ? 'YES' : 'NO');
}
console.log('');

// Test 2: With tenant slug
console.log('Test 2: Login WITH tenant slug "omsystems-pilot"');
const result2 = await pool.query(query1, ['mgdhanyamohan', 'omsystems-pilot']);
console.log('Found:', result2.rows.length > 0 ? 'YES' : 'NO');
if (result2.rows.length > 0) {
  const user = result2.rows[0];
  console.log('  Username:', user.username);
  console.log('  Tenant Slug:', user.tenant_slug);
  console.log('  Status:', user.status);
  const valid = await bcrypt.compare(testPassword, user.password_hash);
  console.log('  Password valid:', valid ? 'YES' : 'NO');
}
console.log('');

// Check account lock status
console.log('Test 3: Check account lock status');
const lockCheck = await pool.query(
  `SELECT username, login_attempts, locked_until, status 
   FROM users 
   WHERE username = $1`,
  ['mgdhanyamohan']
);
const user = lockCheck.rows[0];
console.log('  Login attempts:', user.login_attempts);
console.log('  Locked until:', user.locked_until || 'Not locked');
console.log('  Status:', user.status);

if (user.locked_until) {
  const now = new Date();
  const lockExpiry = new Date(user.locked_until);
  if (lockExpiry > now) {
    console.log('  ⚠️ ACCOUNT IS LOCKED until', lockExpiry.toLocaleString());
    console.log('  Time remaining:', Math.round((lockExpiry - now) / 1000 / 60), 'minutes');
  } else {
    console.log('  ✅ Lock has expired');
  }
}

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
