import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const username = 'mgdhanyamohan';
const password = 'Thathu@110';
const tenantSlug = null;

console.log('🧪 Simulating complete API login flow...\n');
console.log('Request body:');
console.log(JSON.stringify({ username, password, tenantSlug }, null, 2));
console.log('');

try {
  // Step 1: Find user by username (exact query from infrastructure-repository.ts)
  console.log('Step 1: Finding user with findUserByUsername query...');
  
  const userQuery = `
    SELECT u.id::text, u.tenant_id::text, u.identity_subject,
      u.display_name, u.email, u.username, u.employee_id, u.phone_number,
      u.role, u.status, u.department, u.designation, u.date_of_joining,
      u.date_of_birth, u.reporting_to_user_id::text, u.last_login_at,
      u.must_change_password, u.preferences, u.active, u.created_at, u.updated_at
      ,(SELECT assignment.scope_node_id::text
        FROM user_organizational_assignments assignment
        WHERE assignment.user_id=u.id AND assignment.is_primary=true
        LIMIT 1) AS primary_org_node_id
      ,(SELECT node.name
        FROM user_organizational_assignments assignment
        JOIN resource_nodes node ON node.id=assignment.scope_node_id
        WHERE assignment.user_id=u.id AND assignment.is_primary=true
        LIMIT 1) AS primary_org_name
      , u.password_hash
      FROM users u
       JOIN tenants t ON t.id=u.tenant_id
       WHERE lower(u.username)=lower($1)
         AND ($2::text IS NULL OR t.slug=$2) LIMIT 1
  `;
  
  const result = await pool.query(userQuery, [username, tenantSlug]);
  
  if (result.rows.length === 0) {
    console.log('❌ FAILED: User not found');
    console.log('   This would return: 401 invalid_credentials');
    process.exit(1);
  }
  
  const user = result.rows[0];
  console.log('✅ User found');
  console.log('   Username:', user.username);
  console.log('   Status:', user.status);
  console.log('   Role:', user.role);
  console.log('   Password hash exists:', !!user.password_hash);
  console.log('   Password hash length:', user.password_hash?.length || 0);
  console.log('');
  
  // Step 2: Check account status
  console.log('Step 2: Checking account status...');
  if (user.status !== 'active') {
    console.log('❌ FAILED: Account not active');
    console.log(`   Status: ${user.status}`);
    console.log('   This would return: 403 account_' + user.status);
    process.exit(1);
  }
  console.log('✅ Account is active');
  console.log('');
  
  // Step 3: Verify password
  console.log('Step 3: Verifying password with bcrypt.compare...');
  console.log('   Input password:', password);
  console.log('   Hash (first 30 chars):', user.password_hash?.substring(0, 30));
  
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isPasswordValid) {
    console.log('❌ FAILED: Password verification failed');
    console.log('   This would return: 401 invalid_credentials');
    console.log('');
    
    // Additional debugging
    console.log('🔍 Debugging password issue...');
    
    // Test with other common variations
    const variations = [
      'Thathu110',
      'Thathu@110',
      'thathu@110',
      'THATHU@110'
    ];
    
    console.log('Testing password variations:');
    for (const testPwd of variations) {
      const match = await bcrypt.compare(testPwd, user.password_hash);
      console.log(`   "${testPwd}": ${match ? '✅ MATCH' : '❌ no match'}`);
    }
    
    process.exit(1);
  }
  
  console.log('✅ Password is valid');
  console.log('');
  
  console.log('🎉 LOGIN WOULD SUCCEED!\n');
  console.log('The API would return:');
  console.log(JSON.stringify({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      tenantId: user.tenant_id,
      mustChangePassword: user.must_change_password
    },
    message: 'Login successful'
  }, null, 2));
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
} finally {
  await pool.end();
}
