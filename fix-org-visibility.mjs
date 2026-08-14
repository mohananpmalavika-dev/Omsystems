#!/usr/bin/env node
/**
 * Quick fix tool for organization visibility issue
 * Usage: node fix-org-visibility.mjs [username]
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const username = process.argv[2];

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     🔍 Organization Visibility Fix Tool                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  try {
    // 1. Check for organizations
    console.log('1️⃣ Checking for organizations...');
    const orgsResult = await pool.query(
      `SELECT id, name, node_type, tenant_id, is_active
       FROM resource_nodes
       WHERE node_type = 'company'
       ORDER BY created_at`
    );

    if (orgsResult.rows.length === 0) {
      console.log('   ❌ No organizations found in database');
      console.log('   → You can create a new organization\n');
      process.exit(0);
    }

    console.log(`   ✅ Found ${orgsResult.rows.length} organization(s):`);
    orgsResult.rows.forEach(org => {
      console.log(`      - ${org.name} (${org.is_active ? 'active' : 'inactive'})`);
    });

    // 2. Check users
    console.log('\n2️⃣ Checking users...');
    let targetUser;

    if (username) {
      const userResult = await pool.query(
        `SELECT id, username, display_name, role, is_active
         FROM users
         WHERE username = $1`,
        [username]
      );

      if (userResult.rows.length === 0) {
        console.log(`   ❌ User '${username}' not found`);
        process.exit(1);
      }

      targetUser = userResult.rows[0];
    } else {
      // Find first active user
      const usersResult = await pool.query(
        `SELECT id, username, display_name, role, is_active
         FROM users
         WHERE is_active = true
         ORDER BY created_at
         LIMIT 1`
      );

      if (usersResult.rows.length === 0) {
        console.log('   ❌ No active users found');
        process.exit(1);
      }

      targetUser = usersResult.rows[0];
    }

    console.log(`   ✅ Target user: ${targetUser.display_name} (@${targetUser.username})`);
    console.log(`      Current role: ${targetUser.role}`);

    // 3. Check current permissions
    console.log('\n3️⃣ Checking current permissions...');
    const assignmentsResult = await pool.query(
      `SELECT rn.node_id, n.name as node_name, n.node_type, rn.role
       FROM role_node_assignments rn
       JOIN resource_nodes n ON n.id = rn.node_id
       WHERE rn.user_id = $1`,
      [targetUser.id]
    );

    if (assignmentsResult.rows.length === 0) {
      console.log('   ⚠️  No node assignments found');
    } else {
      console.log(`   Found ${assignmentsResult.rows.length} assignment(s):`);
      assignmentsResult.rows.forEach(a => {
        console.log(`      - ${a.node_name} (${a.node_type}) as ${a.role}`);
      });
    }

    // 4. Apply fix
    console.log('\n4️⃣ Applying fix...');

    if (targetUser.role === 'company_admin' || targetUser.role === 'super_admin') {
      console.log('   ℹ️  User already has admin role, no fix needed');
      
      // Check if they still can't see the org
      const visibleOrgs = assignmentsResult.rows.filter(a => a.node_type === 'company');
      if (visibleOrgs.length === 0 && orgsResult.rows.length > 0) {
        console.log('   ⚠️  User has admin role but no explicit org assignments');
        console.log('   → This might be a different issue (e.g., tenant mismatch)');
      }
    } else {
      // Grant company_admin role
      console.log(`   🔧 Upgrading ${targetUser.username} to company_admin...`);
      
      await pool.query(
        `UPDATE users
         SET role = 'company_admin'
         WHERE id = $1`,
        [targetUser.id]
      );

      console.log('   ✅ Role updated successfully!');
    }

    // 5. Verify
    console.log('\n5️⃣ Verifying fix...');
    const updatedUser = await pool.query(
      `SELECT username, display_name, role
       FROM users
       WHERE id = $1`,
      [targetUser.id]
    );

    console.log(`   ✅ ${updatedUser.rows[0].display_name}`);
    console.log(`      Role: ${updatedUser.rows[0].role}`);
    console.log(`      Can access: All organization nodes in tenant`);

    console.log('\n✅ Fix complete! Refresh your browser to see the organization.\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Next Steps:                                               ║');
    console.log('║  1. Refresh your browser (Ctrl+F5 or Cmd+Shift+R)         ║');
    console.log('║  2. Navigate to /admin page                                ║');
    console.log('║  3. Your organization should now be visible!               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
