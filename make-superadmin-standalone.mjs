#!/usr/bin/env node
/**
 * Standalone script to make mgdhanyamohan a super_admin
 * ES Module version
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const USERNAME = 'mgdhanyamohan';

async function makeSuperAdmin() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Update user role
    console.log(`📝 Updating user '${USERNAME}' to super_admin...`);
    const updateResult = await client.query(
      `UPDATE users
       SET role = 'super_admin',
           status = 'active',
           updated_at = now()
       WHERE username = $1
       RETURNING id, username, display_name, role, status`,
      [USERNAME]
    );

    if (updateResult.rowCount === 0) {
      console.error(`\n❌ User '${USERNAME}' not found in database`);
      console.log('\nPlease verify:');
      console.log('  1. The username is correct');
      console.log('  2. The user exists in the users table');
      process.exit(1);
    }

    const user = updateResult.rows[0];
    console.log('✅ User updated successfully:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Display Name:', user.display_name);
    console.log('   Role:', user.role);
    console.log('   Status:', user.status);

    // Grant organization access
    console.log('\n📝 Granting org:manage access...');
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
      [USERNAME]
    );

    if (grantResult.rowCount > 0) {
      console.log(`✅ Granted org:manage access to ${grantResult.rowCount} company node(s)`);
    } else {
      console.log('⚠️  User already has org:manage access or no company nodes found');
    }

    // Grant live:view and audit:view access as well
    console.log('\n📝 Granting additional permissions...');
    const additionalGrants = await client.query(
      `INSERT INTO access_grants (tenant_id, user_id, scope_node_id, action, effect, created_at)
       SELECT 
         u.tenant_id,
         u.id as user_id,
         rn.id as scope_node_id,
         action,
         'allow' as effect,
         now() as created_at
       FROM users u
       CROSS JOIN resource_nodes rn
       CROSS JOIN (VALUES ('live:view'), ('audit:view')) AS actions(action)
       WHERE u.username = $1
         AND rn.tenant_id = u.tenant_id
         AND NOT EXISTS (
           SELECT 1 FROM access_grants ag
           WHERE ag.user_id = u.id 
             AND ag.scope_node_id = rn.id 
             AND ag.action = actions.action
         )
       RETURNING action, scope_node_id`,
      [USERNAME]
    );

    if (additionalGrants.rowCount > 0) {
      console.log(`✅ Granted ${additionalGrants.rowCount} additional permission(s)`);
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
       ORDER BY ag.action, rn.node_type`,
      [USERNAME]
    );

    if (grantsResult.rowCount > 0) {
      console.log('\n📋 Current Access Grants:');
      grantsResult.rows.forEach(grant => {
        if (grant.action) {
          console.log(`   ✓ ${grant.action.padEnd(15)} on ${grant.node_type?.padEnd(15) || 'unknown'.padEnd(15)} "${grant.node_name}" (${grant.effect})`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS! User mgdhanyamohan is now a super_admin');
    console.log('='.repeat(60));
    console.log('\n📌 NEXT STEPS:');
    console.log('   1. Log out from the application');
    console.log('   2. Log back in as mgdhanyamohan');
    console.log('   3. Navigate to /admin page');
    console.log('   4. You should now see the organization tree');
    console.log('   5. You can add branches, employees, and cameras\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed\n');
  }
}

console.log('='.repeat(60));
console.log('   Making mgdhanyamohan a Super Admin');
console.log('='.repeat(60));
console.log('');

makeSuperAdmin().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
