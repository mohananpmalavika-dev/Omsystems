import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const username = 'mgdhanyamohan';
const password = process.env.TEST_PASSWORD;
if (!password) throw new Error('TEST_PASSWORD is required');
const tenantSlug = null; // Try without tenant slug

console.log('🧪 Testing login flow...\n');
console.log('Login attempt:');
console.log('  Username:', username);
console.log('  Password: <provided via TEST_PASSWORD>');
console.log('  Tenant Slug:', tenantSlug || '(none)');
console.log('');

try {
  // Step 1: Find user by username (simulating findUserByUsername)
  console.log('Step 1: Finding user...');
  const userQuery = `
    SELECT 
      u.id, 
      u.tenant_id, 
      u.username, 
      u.email,
      u.display_name,
      u.password_hash, 
      u.role, 
      u.status,
      t.name as tenant_name,
      t.slug as tenant_slug
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE LOWER(u.username) = LOWER($1)
      AND ($2::text IS NULL OR t.slug = $2)
    LIMIT 1
  `;
  
  const result = await pool.query(userQuery, [username, tenantSlug]);
  
  if (result.rows.length === 0) {
    console.log('❌ User not found');
    console.log('   This means findUserByUsername returned nothing');
    process.exit(1);
  }
  
  const user = result.rows[0];
  console.log('✅ User found:');
  console.log('   ID:', user.id);
  console.log('   Username:', user.username);
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Status:', user.status);
  console.log('   Tenant:', user.tenant_name);
  console.log('   Tenant Slug:', user.tenant_slug || '(null)');
  console.log('');
  
  // Step 2: Check account status
  console.log('Step 2: Checking account status...');
  if (user.status !== 'active') {
    console.log('❌ Account is not active:', user.status);
    process.exit(1);
  }
  console.log('✅ Account is active');
  console.log('');
  
  // Step 3: Verify password
  console.log('Step 3: Verifying password...');
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isPasswordValid) {
    console.log('❌ Password is invalid');
    process.exit(1);
  }
  console.log('✅ Password is valid');
  console.log('');
  
  console.log('🎉 Login would succeed!\n');
  console.log('Summary:');
  console.log('  ✅ User exists');
  console.log('  ✅ Account is active');
  console.log('  ✅ Password matches');
  console.log('  ✅ Ready to create session');
  console.log('');
  console.log('Login credentials are working correctly.');
  
} catch (error) {
  console.error('❌ Error during login test:', error.message);
  console.error('Full error:', error);
} finally {
  await pool.end();
}
