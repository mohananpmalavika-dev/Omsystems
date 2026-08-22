#!/usr/bin/env node
/**
 * Script to make a user a super_admin
 * Usage: node make-superadmin.js <username>
 * Example: node make-superadmin.js mgdhanyamohan
 */

const { Client } = require('pg');

const username = process.argv[2] || 'mgdhanyamohan';

// Database connection string
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function makeSuperAdmin() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Render.com databases
    }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Update user role
    const updateResult = await client.query(
      `UPDATE users
       SET role = 'super_admin',
           status = 'active',
           updated_at = now()
       WHERE username = $1
       RETURNING id, username, display_name, role, status`,
      [username]
    );

    if (updateResult.rowCount === 0) {
      console.error(`❌ User '${username}' not found`);
      process.exit(1);
    }

    const user = updateResult.rows[0];
    console.log('\n✅ User updated successfully:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Display Name:', user.display_name);
    console.log('   Role:', user.role);
    console.log('   Status:', user.status);

    // Grant organization access
    const grantResult = await client.query(
      `INSERT INTO access_grants (tenant_id, user_id, scope_node_id, action, effect, created_at)
       SELECT 
         u.tenant_id,
         u.id as user_id,
         rn.id as scope_node_id,
         'org:manage' as action,
         'allow' as effect,
         now() as created_at
       FROM users u
       CROSS JOIN resource_nodes rn
       WHERE u.username = $1
         AND rn.tenant_id = u.tenant_id
         AND rn.node_type = 'company'
         AND NOT EXISTS (
           SELECT 1 FROM access_grants ag
           WHERE ag.user_id = u.id 
             AND ag.scope_node_id = rn.id 
             AND ag.action = 'org:manage'
         )
       RETURNING *`,
      [username]
    );

    if (grantResult.rowCount > 0) {
      console.log(`\n✅ Granted org:manage access to ${grantResult.rowCount} company node(s)`);
    } else {
      console.log('\n⚠️  User already has org:manage access or no company nodes found');
    }

    // Show current grants
    const grantsResult = await client.query(
      `SELECT 
         ag.action,
         rn.name as node_name,
         rn.node_type,
         ag.effect
       FROM users u
       LEFT JOIN access_grants ag ON ag.user_id = u.id
       LEFT JOIN resource_nodes rn ON rn.id = ag.scope_node_id
       WHERE u.username = $1
       ORDER BY ag.action`,
      [username]
    );

    if (grantsResult.rowCount > 0) {
      console.log('\n📋 Access Grants:');
      grantsResult.rows.forEach(grant => {
        console.log(`   ${grant.action} on ${grant.node_type} "${grant.node_name}" (${grant.effect})`);
      });
    }

    console.log('\n✅ Done! Please log out and log back in for changes to take effect.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

makeSuperAdmin();
