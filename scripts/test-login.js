#!/usr/bin/env node
/**
 * Test Login Script
 * Tests if the user can login and diagnoses authentication issues
 */

import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function testLogin() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('================================================');
    console.log('       LOGIN DIAGNOSTIC SCRIPT');
    console.log('================================================\n');

    const username = 'mgdhanyamohan';
    const password = process.env.TEST_PASSWORD;
    if (!password) throw new Error('TEST_PASSWORD is required');
    const tenantSlug = undefined; // Try without tenant slug first

    console.log(`Testing login for: ${username}\n`);

    // 1. Check if user exists
    console.log('1️⃣  Checking if user exists...');
    const userQuery = `
      SELECT 
        u.id, u.tenant_id, u.username, u.email, u.display_name,
        u.password_hash, u.role, u.status, u.active,
        u.login_attempts, u.locked_until, u.must_change_password,
        t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.username) = LOWER($1)
        AND ($2::text IS NULL OR t.slug = $2)
      LIMIT 1
    `;

    const userResult = await pool.query(userQuery, [username, tenantSlug || null]);

    if (userResult.rows.length === 0) {
      console.log('❌ User not found!\n');
      console.log('Checking all users with similar username...');
      const allUsers = await pool.query(`
        SELECT u.username, u.email, u.status, t.name as tenant_name
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE LOWER(u.username) LIKE LOWER($1)
      `, [`%${username}%`]);
      
      if (allUsers.rows.length > 0) {
        console.log('Found similar users:');
        allUsers.rows.forEach(u => {
          console.log(`  - ${u.username} (${u.email}) - Status: ${u.status} - Tenant: ${u.tenant_name}`);
        });
      } else {
        console.log('No users found with similar username');
      }
      
      await pool.end();
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log('✅ User found!\n');
    console.log('User Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Display Name: ${user.display_name}`);
    console.log(`  Tenant: ${user.tenant_name} (${user.tenant_slug || 'no slug'})`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Status: ${user.status}`);
    console.log(`  Active: ${user.active}`);
    console.log(`  Login Attempts: ${user.login_attempts}`);
    console.log(`  Locked Until: ${user.locked_until || 'not locked'}`);
    console.log(`  Must Change Password: ${user.must_change_password}`);
    console.log(`  Has Password Hash: ${user.password_hash ? 'Yes' : 'No'}\n`);

    // 2. Check account status
    console.log('2️⃣  Checking account status...');
    if (user.status !== 'active') {
      console.log(`❌ Account is not active! Status: ${user.status}`);
      console.log('   Fix: UPDATE users SET status = \'active\' WHERE id = \'' + user.id + '\'\n');
      await pool.end();
      process.exit(1);
    }
    console.log('✅ Account is active\n');

    // 3. Check if account is locked
    console.log('3️⃣  Checking account lockout...');
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      console.log(`❌ Account is locked until ${user.locked_until}`);
      console.log('   Fix: UPDATE users SET locked_until = NULL, login_attempts = 0 WHERE id = \'' + user.id + '\'\n');
      await pool.end();
      process.exit(1);
    }
    console.log('✅ Account is not locked\n');

    // 4. Check password hash
    console.log('4️⃣  Checking password hash...');
    if (!user.password_hash) {
      console.log('❌ No password hash found!');
      console.log('   Run: node scripts/create-app-superuser.js\n');
      await pool.end();
      process.exit(1);
    }
    console.log('✅ Password hash exists\n');

    // 5. Verify password
    console.log('5️⃣  Verifying password...');
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      console.log('❌ Password does not match!');
      console.log('   The stored password hash does not match the provided password.');
      console.log('   This could mean:');
      console.log('   - Password was changed');
      console.log('   - Hash was corrupted');
      console.log('   - Wrong hashing algorithm was used\n');
      console.log('   Fix: Run node scripts/create-app-superuser.js to reset password\n');
      await pool.end();
      process.exit(1);
    }
    console.log('✅ Password is correct!\n');

    // 6. Check organizational assignment
    console.log('6️⃣  Checking organizational assignment...');
    const orgAssignment = await pool.query(`
      SELECT uoa.id, uoa.is_primary, rn.name as org_name, rn.node_type
      FROM user_organizational_assignments uoa
      JOIN resource_nodes rn ON uoa.scope_node_id = rn.id
      WHERE uoa.user_id = $1
    `, [user.id]);

    if (orgAssignment.rows.length === 0) {
      console.log('⚠️  No organizational assignment found');
      console.log('   User may not have proper permissions\n');
    } else {
      console.log(`✅ Found ${orgAssignment.rows.length} organizational assignment(s):`);
      orgAssignment.rows.forEach(org => {
        console.log(`   - ${org.org_name} (${org.node_type})${org.is_primary ? ' [PRIMARY]' : ''}`);
      });
      console.log();
    }

    // 7. Check access grants
    console.log('7️⃣  Checking access grants...');
    const grants = await pool.query(`
      SELECT ag.action, ag.effect, ag.grant_source, rn.name as resource_name
      FROM access_grants ag
      JOIN resource_nodes rn ON ag.scope_node_id = rn.id
      WHERE ag.user_id = $1
      LIMIT 10
    `, [user.id]);

    if (grants.rows.length === 0) {
      console.log('⚠️  No access grants found');
      console.log('   User may not have permissions to access resources\n');
    } else {
      console.log(`✅ Found ${grants.rows.length} access grant(s):`);
      grants.rows.slice(0, 5).forEach(grant => {
        console.log(`   - ${grant.action} on ${grant.resource_name} (${grant.effect}, source: ${grant.grant_source})`);
      });
      if (grants.rows.length > 5) {
        console.log(`   ... and ${grants.rows.length - 5} more`);
      }
      console.log();
    }

    console.log('================================================');
    console.log('✅ ALL CHECKS PASSED!');
    console.log('================================================\n');
    console.log('The user account is properly configured.');
    console.log('If login still fails, check:');
    console.log('1. Frontend is sending correct username/password');
    console.log('2. Backend server is using correct DATABASE_URL');
    console.log('3. Backend logs for detailed error messages');
    console.log('4. Network connectivity to backend server\n');

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testLogin();
