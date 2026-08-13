import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg;

const DB_URL = "postgresql://omtech_user:uWpzCli9H14xNhMh9m8rA9rpmkE64O84@dpg-d9tmg9id0e5s739i01f0-a.oregon-postgres.render.com/omtech";

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔍 COMPREHENSIVE LOGIN DIAGNOSIS\n');
console.log('=' .repeat(60));

// Step 1: Unlock account
console.log('\n1️⃣ UNLOCKING ACCOUNT...');
await pool.query(
  "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE username = 'mgdhanyamohan'"
);
console.log('✅ Account unlocked\n');

// Step 2: Check user exists
console.log('2️⃣ CHECKING USER IN DATABASE...');
const userResult = await pool.query(`
  SELECT 
    u.id, 
    u.username, 
    u.email, 
    u.password_hash,
    u.status, 
    u.role,
    u.login_attempts,
    u.locked_until,
    u.tenant_id,
    t.name as tenant_name,
    t.slug as tenant_slug
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.username = 'mgdhanyamohan'
`);

if (userResult.rows.length === 0) {
  console.log('❌ USER NOT FOUND IN DATABASE!');
  await pool.end();
  process.exit(1);
}

const user = userResult.rows[0];
console.log('✅ User found:');
console.log('   Username:', user.username);
console.log('   Email:', user.email);
console.log('   Status:', user.status);
console.log('   Role:', user.role);
console.log('   Tenant:', user.tenant_name);
console.log('   Tenant Slug:', user.tenant_slug);
console.log('   Login Attempts:', user.login_attempts);
console.log('   Locked Until:', user.locked_until || 'Not locked');

// Step 3: Test password
console.log('\n3️⃣ TESTING PASSWORD VERIFICATION...');
const testPasswords = ['Thathu@110', 'Thathu110', 'thathu@110'];

for (const pwd of testPasswords) {
  const isValid = await bcrypt.compare(pwd, user.password_hash);
  console.log(`   Password "${pwd}": ${isValid ? '✅ VALID' : '❌ Invalid'}`);
}

// Step 4: Simulate login query
console.log('\n4️⃣ SIMULATING BACKEND LOGIN QUERY...');
const loginQuery = `
  SELECT 
    u.id, 
    u.tenant_id, 
    u.username, 
    u.email,
    u.display_name,
    u.password_hash, 
    u.role, 
    u.status,
    u.must_change_password,
    u.active
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE LOWER(u.username) = LOWER($1)
    AND ($2::text IS NULL OR t.slug = $2)
  LIMIT 1
`;

// Test without tenant slug
const withoutTenant = await pool.query(loginQuery, ['mgdhanyamohan', null]);
console.log('   Without tenant slug:', withoutTenant.rows.length > 0 ? '✅ Found' : '❌ Not found');

// Test with tenant slug
const withTenant = await pool.query(loginQuery, ['mgdhanyamohan', 'omsystems-pilot']);
console.log('   With tenant slug "omsystems-pilot":', withTenant.rows.length > 0 ? '✅ Found' : '❌ Not found');

console.log('\n' + '='.repeat(60));
console.log('\n✅ DIAGNOSIS COMPLETE\n');
console.log('LOGIN CREDENTIALS:');
console.log('  Username: mgdhanyamohan');
console.log('  Password: Thathu@110');
console.log('  Org Code: omsystems-pilot (optional)');
console.log('');
console.log('⚠️  IMPORTANT: Make sure your backend server is:');
console.log('   1. Restarted after .env change');
console.log('   2. Using the production database');
console.log('   3. Running and accessible');

await pool.end();
