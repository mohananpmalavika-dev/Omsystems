#!/usr/bin/env node
/**
 * Create Application Superuser
 */

import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

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
    const identitySubject = `local:${username}`; // Using local auth

    console.log('Creating superuser:');
    console.log(`  Username: ${username}`);
    console.log(`  Display Name: ${displayName}`);
    console.log(`  Identity: ${identitySubject}\n`);

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

    // 3. Check if user exists
    console.log('3️⃣  Checking if user exists...');
    const existingUser = await pool.query(
      'SELECT id, identity_subject, display_name FROM users WHERE identity_subject = $1',
      [identitySubject]
    );

    let userId;

    if (existingUser.rows.length > 0) {
      console.log(`⚠️  User '${username}' already exists (ID: ${existingUser.rows[0].id})`);
      console.log('   Updating user...\n');

      // Update existing user
      await pool.query(
        `UPDATE users 
         SET display_name = $1,
             active = true
         WHERE identity_subject = $2`,
        [displayName, identitySubject]
      );

      userId = existingUser.rows[0].id;
      console.log('✅ User updated\n');
    } else {
      // Create new user
      console.log('4️⃣  Creating new user...');
      
      const result = await pool.query(
        `INSERT INTO users (
          tenant_id, identity_subject, display_name, active, created_at
        ) VALUES ($1, $2, $3, true, NOW())
        RETURNING id, identity_subject, display_name`,
        [tenantId, identitySubject, displayName]
      );

      userId = result.rows[0].id;
      console.log('✅ User created successfully!\n');
      console.log('📋 User Details:');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Identity: ${result.rows[0].identity_subject}`);
      console.log(`   Display Name: ${result.rows[0].display_name}\n`);
    }

    // 5. Store credentials in a separate auth table (if it exists)
    console.log('5️⃣  Storing authentication credentials...');
    
    // Check if auth_credentials table exists
    const authTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'auth_credentials'
      )`);
    
    if (authTableCheck.rows[0].exists) {
      await pool.query(`
        INSERT INTO auth_credentials (user_id, username, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (username) 
        DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
      `, [userId, username, passwordHash]);
      console.log('✅ Credentials stored\n');
    } else {
      console.log('⚠️  auth_credentials table not found. Creating it...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_credentials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO auth_credentials (user_id, username, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [userId, username, passwordHash]);
      console.log('✅ Table created and credentials stored\n');
    }

    // 6. Grant full access permissions
    console.log('6️⃣  Granting superuser access to all resources...');
    
    // Get root resource node
    const rootNode = await pool.query(`
      SELECT id FROM resource_nodes 
      WHERE tenant_id = $1 AND parent_id IS NULL 
      LIMIT 1
    `, [tenantId]);

    if (rootNode.rows.length > 0) {
      const rootNodeId = rootNode.rows[0].id;
      
      // Grant all actions on root (cascades to all children)
      const actions = ['read', 'write', 'delete', 'admin', '*'];
      
      for (const action of actions) {
        await pool.query(`
          INSERT INTO access_grants (
            tenant_id, user_id, scope_node_id, action, effect, created_at
          ) VALUES ($1, $2, $3, $4, 'allow', NOW())
          ON CONFLICT DO NOTHING
        `, [tenantId, userId, rootNodeId, action]);
      }
      
      console.log(`   ✅ Granted full access on root resource node\n`);
    } else {
      console.log(`   ⚠️  No root resource node found. Creating one...`);
      const newRoot = await pool.query(`
        INSERT INTO resource_nodes (tenant_id, name, type, path, created_at)
        VALUES ($1, 'root', 'folder', 'root', NOW())
        RETURNING id
      `, [tenantId]);
      
      const rootNodeId = newRoot.rows[0].id;
      const actions = ['read', 'write', 'delete', 'admin', '*'];
      
      for (const action of actions) {
        await pool.query(`
          INSERT INTO access_grants (
            tenant_id, user_id, scope_node_id, action, effect, created_at
          ) VALUES ($1, $2, $3, $4, 'allow', NOW())
        `, [tenantId, userId, rootNodeId, action]);
      }
      
      console.log(`   ✅ Created root node and granted full access\n`);
    }

    console.log('\n🎉 Superuser setup complete!\n');
    console.log('🔑 Login Credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Access: Full admin access to all resources\n`);

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
