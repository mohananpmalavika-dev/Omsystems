import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const username = 'mgdhanyamohan';
const password = 'Thathu@110';
const tenantSlug = null;

console.log('🔍 Detailed Login Debug\n');
console.log('Testing login for:', username);
console.log('Tenant slug:', tenantSlug || '(none)');
console.log('');

try {
  // Step 1: Exact query from auth.routes.ts findUserByUsername
  console.log('Step 1: Running exact query from findUserByUsername...');
  const query = `
    SELECT 
      u.id, 
      u.tenant_id as "tenantId",
      u.username, 
      u.email,
      u.display_name as "displayName",
      u.password_hash as "passwordHash",
      u.role, 
      u.status,
      u.must_change_password as "mustChangePassword",
      u.active,
      t.name as tenant_name,
      t.slug as tenant_slug
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE LOWER(u.username) = LOWER($1)
      AND ($2::text IS NULL OR t.slug = $2)
    LIMIT 1
  `;
  
  const result = await pool.query(query, [username, tenantSlug]);
  
  if (result.rows.length === 0) {
    console.log('❌ PROBLEM: User not found with this query!');
    console.log('   This is why login fails.');
    console.log('');
    
    // Try without tenant check
    console.log('Trying without tenant slug check...');
    const simpleQuery = `
      SELECT u.id, u.username, u.password_hash, u.status, t.slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.username) = LOWER($1)
      LIMIT 1
    `;
    const simpleResult = await pool.query(simpleQuery, [username]);
    
    if (simpleResult.rows.length > 0) {
      console.log('✅ User found without tenant check:');
      console.log('   Username:', simpleResult.rows[0].username);
      console.log('   Tenant Slug:', simpleResult.rows[0].slug);
      console.log('   Status:', simpleResult.rows[0].status);
      console.log('');
      console.log('💡 SOLUTION: The tenant table might be missing a slug, or the JOIN is failing');
    } else {
      console.log('❌ User not found even without tenant check!');
      console.log('   The user might not exist in this database.');
    }
    process.exit(1);
  }
  
  const user = result.rows[0];
  console.log('✅ User found!');
  console.log('   ID:', user.id);
  console.log('   Username:', user.username);
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Status:', user.status);
  console.log('   Active:', user.active);
  console.log('   Must change password:', user.mustChangePassword);
  console.log('   Tenant:', user.tenant_name);
  console.log('   Tenant Slug:', user.tenant_slug);
  console.log('');
  
  // Step 2: Check status
  console.log('Step 2: Checking account status...');
  if (user.status !== 'active') {
    console.log('❌ PROBLEM: Account status is not active:', user.status);
    process.exit(1);
  }
  console.log('✅ Status is active');
  console.log('');
  
  // Step 3: Verify password
  console.log('Step 3: Verifying password...');
  console.log('   Password hash exists:', user.passwordHash ? 'Yes' : 'No');
  
  if (!user.passwordHash) {
    console.log('❌ PROBLEM: No password hash stored!');
    process.exit(1);
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  console.log('   Password matches:', isValid ? '✅ YES' : '❌ NO');
  console.log('');
  
  if (!isValid) {
    console.log('❌ PROBLEM: Password does not match!');
    console.log('   The password hash in the database does not match the provided password.');
    process.exit(1);
  }
  
  console.log('🎉 ALL CHECKS PASSED!');
  console.log('');
  console.log('The login should work. If it still fails, the issue is:');
  console.log('1. Backend server not using this database');
  console.log('2. Backend server not restarted after .env change');
  console.log('3. Different API endpoint being called');
  console.log('4. Middleware or other validation failing');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Code:', error.code);
  console.error('Detail:', error.detail);
  if (error.stack) {
    console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
  }
} finally {
  await pool.end();
}
