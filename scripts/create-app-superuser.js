#!/usr/bin/env node
/**
 * Create Application Superuser
 */

import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function createSuperUser() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('================================================');
    console.log('       SUPERUSER CREATION SCRIPT');
    console.log('================================================\n');

    const username = 'mgdhanyamohan';
    const password = 'Thathu110';
    const displayName = 'Dhanya Mohan';
    const email = 'mgdhanyamohan@omsystems.com';
    const identitySubject = `local:${username}`; // Using local auth
    const role = 'super_admin';
    const status = 'active';

    console.log('Creating superuser:');
    console.log(`  Username: ${username}`);
    console.log(`  Email: ${email}`);
    console.log(`  Display Name: ${displayName}`);
    console.log(`  Role: ${role}`);
    console.log(`  Status: ${status}\n`);

    // 1. Hash password
    console.log('1️⃣  Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed\n');

    // 2. Get or create a tenant first
    console.log('2️⃣  Checking for tenant...');
    let tenant = await pool.query('SELECT id, name FROM tenants LIMIT 1');
    
    let tenantId;
    if (tenant.rows.length === 0) {
      console.log('   No tenant found, creating default tenant...');
      const newTenant = await pool.query(
        `INSERT INTO tenants (name, created_at) 
         VALUES ($1, NOW()) 
         RETURNING id, name`,
        ['Default Tenant']
      );
      tenantId = newTenant.rows[0].id;
      console.log(`   ✅ Created tenant: ${newTenant.rows[0].name} (${tenantId})\n`);
    } else {
      tenantId = tenant.rows[0].id;
      console.log(`   ✅ Using existing tenant: ${tenant.rows[0].name} (${tenantId})\n`);
    }

    // 3. Check if user exists (check both by username and identity_subject)
    console.log('3️⃣  Checking if user exists...');
    let existingUser = await pool.query(
      'SELECT id, username, role, status FROM users WHERE (LOWER(username) = LOWER($1) OR identity_subject = $2) AND tenant_id = $3',
      [username, identitySubject, tenantId]
    );

    let userId;

    if (existingUser.rows.length > 0) {
      console.log(`⚠️  User '${username}' already exists (ID: ${existingUser.rows[0].id})`);
      console.log('   Updating user to superuser...\n');

      // Update existing user to superuser
      await pool.query(
        `UPDATE users 
         SET display_name = $1,
             email = $2,
             username = $3,
             password_hash = $4,
             role = $5,
             status = $6,
             must_change_password = false,
             active = true,
             updated_at = NOW()
         WHERE id = $7`,
        [displayName, email, username, passwordHash, role, status, existingUser.rows[0].id]
      );

      userId = existingUser.rows[0].id;
      console.log('✅ User updated to superuser\n');
    } else {
      // Create new user
      console.log('4️⃣  Creating new superuser...');
      
      const result = await pool.query(
        `INSERT INTO users (
          tenant_id, identity_subject, display_name, email, username, 
          password_hash, role, status, must_change_password, active, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, true, NOW(), NOW())
        RETURNING id, username, email, role, status`,
        [tenantId, identitySubject, displayName, email, username, passwordHash, role, status]
      );

      userId = result.rows[0].id;
      console.log('✅ Superuser created successfully!\n');
      console.log('📋 User Details:');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Username: ${result.rows[0].username}`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log(`   Role: ${result.rows[0].role}`);
      console.log(`   Status: ${result.rows[0].status}\n`);
    }

    // 5. Get or create primary organizational assignment (required for permissions)
    console.log('5️⃣  Setting up organizational assignment...');
    
    // Get company node
    const companyNode = await pool.query(`
      SELECT id, name FROM resource_nodes 
      WHERE tenant_id = $1 AND node_type = 'company'
      ORDER BY created_at 
      LIMIT 1
    `, [tenantId]);

    if (companyNode.rows.length > 0) {
      const orgNodeId = companyNode.rows[0].id;
      
      await pool.query(`
        INSERT INTO user_organizational_assignments (
          user_id, tenant_id, scope_node_id, is_primary, assigned_at, assigned_by_user_id
        ) VALUES ($1, $2, $3, true, NOW(), $1)
        ON CONFLICT (user_id, scope_node_id) 
        DO UPDATE SET is_primary = true
      `, [userId, tenantId, orgNodeId]);
      
      console.log(`   ✅ Assigned to organization: ${companyNode.rows[0].name}\n`);
    } else {
      console.log(`   ⚠️  No company node found. Creating one...`);
      const newCompany = await pool.query(`
        INSERT INTO resource_nodes (tenant_id, name, node_type, code, path, is_active, created_at)
        VALUES ($1, 'Default Company', 'company', 'COMP001', 'company', true, NOW())
        RETURNING id, name
      `, [tenantId]);
      
      const orgNodeId = newCompany.rows[0].id;
      
      await pool.query(`
        INSERT INTO user_organizational_assignments (
          user_id, tenant_id, scope_node_id, is_primary, assigned_at, assigned_by_user_id
        ) VALUES ($1, $2, $3, true, NOW(), $1)
      `, [userId, tenantId, orgNodeId]);
      
      console.log(`   ✅ Created company and assigned user\n`);
    }

    // 6. Role-based permissions are automatically granted by trigger
    console.log('6️⃣  Role-based permissions...');
    console.log('   ✅ Permissions automatically granted by database trigger\n');

    console.log('\n🎉 Superuser setup complete!\n');
    console.log('🔑 Login Credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    console.log(`   Status: ${status}`);
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Access: Full super_admin access to all resources\n`);

    await pool.end();
    console.log('✅ Script completed successfully\n');

  } catch (error) {
    console.error('❌ Error creating superuser:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`   Detail: ${error.detail}`);
    }
    await pool.end();
    process.exit(1);
  }
}

createSuperUser();
