#!/usr/bin/env node
/**
 * Final User Setup Script
 * Comprehensive setup to ensure user can login
 */

import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function finalSetup() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('================================================');
    console.log('       FINAL USER SETUP SCRIPT');
    console.log('================================================\n');

    const username = 'mgdhanyamohan';
    const password = process.env.NEW_PASSWORD;
    if (!password) throw new Error('NEW_PASSWORD is required');
    const email = 'mgdhanyamohan@omsystems.com';
    const displayName = 'Dhanya Mohan';
    const identitySubject = `local:${username}`;

    console.log(`Setting up user: ${username}\n`);

    // 1. Get tenant
    const tenant = await pool.query('SELECT id, slug FROM tenants LIMIT 1');
    if (tenant.rows.length === 0) {
      throw new Error('No tenant found');
    }
    const tenantId = tenant.rows[0].id;
    const tenantSlug = tenant.rows[0].slug;
    console.log(`✅ Tenant: ${tenantSlug}\n`);

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Update or create user
    console.log('Checking if user exists...');
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR identity_subject = $2',
      [username, identitySubject]
    );

    let userId;
    if (existingUser.rows.length > 0) {
      console.log('Updating existing user...');
      userId = existingUser.rows[0].id;
      
      await pool.query(`
        UPDATE users SET
          tenant_id = $1,
          identity_subject = $2,
          display_name = $3,
          email = $4,
          username = $5,
          password_hash = $6,
          role = $7,
          status = $8,
          active = $9,
          must_change_password = $10,
          login_attempts = $11,
          locked_until = $12,
          updated_at = NOW()
        WHERE id = $13
      `, [
        tenantId, identitySubject, displayName, email, username,
        passwordHash, 'super_admin', 'active', true, false, 0, null, userId
      ]);
      
      console.log('✅ User updated\n');
    } else {
      console.log('Creating new user...');
      const userResult = await pool.query(`
        INSERT INTO users (
          tenant_id, identity_subject, display_name, email, username,
          password_hash, role, status, active, must_change_password,
          login_attempts, locked_until,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING id, username, email, role, status
      `, [
        tenantId, identitySubject, displayName, email, username,
        passwordHash, 'super_admin', 'active', true, false, 0, null
      ]);

      userId = userResult.rows[0].id;
      console.log('✅ User created\n');
    }

    // Get user details
    const userDetails = await pool.query(
      'SELECT id, username, email, role, status FROM users WHERE id = $1',
      [userId]
    );
    
    console.log('✅ User configured:');
    console.log(`   ID: ${userId}`);
    console.log(`   Username: ${userDetails.rows[0].username}`);
    console.log(`   Email: ${userDetails.rows[0].email}`);
    console.log(`   Role: ${userDetails.rows[0].role}`);
    console.log(`   Status: ${userDetails.rows[0].status}\n`);

    // 5. Setup organizational assignment
    console.log('Setting up organizational assignment...');
    const company = await pool.query(`
      SELECT id FROM resource_nodes
      WHERE tenant_id = $1 AND node_type = 'company'
      ORDER BY created_at LIMIT 1
    `, [tenantId]);

    if (company.rows.length > 0) {
      await pool.query(`
        INSERT INTO user_organizational_assignments (
          user_id, tenant_id, scope_node_id, is_primary
        ) VALUES ($1, $2, $3, true)
      `, [userId, tenantId, company.rows[0].id]);
      console.log('✅ Organizational assignment created\n');
    }

    // 6. Verify password works
    console.log('Verifying password...');
    const verifyUser = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    const isValid = await bcrypt.compare(password, verifyUser.rows[0].password_hash);
    if (!isValid) {
      throw new Error('Password verification failed!');
    }
    console.log('✅ Password verified\n');

    // 7. Test the login query that the backend uses
    console.log('Testing backend login query...');
    const loginTest = await pool.query(`
      SELECT u.id::text, u.tenant_id::text, u.identity_subject,
        u.display_name, u.email, u.username, u.employee_id, u.phone_number,
        u.role, u.status, u.department, u.designation, u.date_of_joining,
        u.date_of_birth, u.reporting_to_user_id::text, u.last_login_at,
        u.must_change_password, u.preferences, u.active, u.created_at, u.updated_at,
        u.password_hash,
        t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(u.username) = lower($1)
        AND ($2::text IS NULL OR t.slug = $2)
      LIMIT 1
    `, [username, null]);

    if (loginTest.rows.length === 0) {
      throw new Error('User not found with backend query!');
    }

    const user = loginTest.rows[0];
    console.log('✅ Backend query successful');
    console.log(`   Found user: ${user.username}`);
    console.log(`   Tenant: ${user.tenant_name} (${user.tenant_slug})`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Active: ${user.active}`);
    console.log(`   Has password: ${!!user.password_hash}\n`);

    // 8. Final verification
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new Error('Password does not match in final check!');
    }

    console.log('================================================');
    console.log('✅ SETUP COMPLETE!');
    console.log('================================================\n');
    console.log('Login credentials:');
    console.log(`  URL: https://sentinel-grid-monitoring1.onrender.com`);
    console.log(`  Username: ${username}`);
    console.log('  Password: stored in the approved secrets provider');
    console.log(`  Tenant Slug: ${tenantSlug} (optional)`);
    console.log('\nIf login still fails:');
    console.log('1. Check if backend server is running (502 Bad Gateway earlier)');
    console.log('2. Check backend logs for detailed error');
    console.log('3. Verify backend DATABASE_URL matches this database');
    console.log('4. Try waking up the Render service first\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

finalSetup();
