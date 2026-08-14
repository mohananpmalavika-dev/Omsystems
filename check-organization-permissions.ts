/**
 * Diagnostic script to check organization permissions issue
 * Run this to diagnose why organization isn't showing
 */

import { createControlPlaneStore } from "./src/control-plane-store.js";

async function diagnose() {
  const store = createControlPlaneStore();
  
  console.log("🔍 Checking organization visibility issue...\n");

  try {
    // 1. Check if any organizations exist at all
    console.log("1️⃣ Checking for existing organizations in database:");
    const allOrgs = await (store as any).pool.query(
      `SELECT id, name, node_type, tenant_id, is_active, parent_id
       FROM resource_nodes
       WHERE node_type = 'company'
       ORDER BY created_at`
    );
    
    if (allOrgs.rows.length === 0) {
      console.log("   ❌ No organizations found in database");
      console.log("   → This is unexpected given the error message");
    } else {
      console.log(`   ✅ Found ${allOrgs.rows.length} organization(s):`);
      allOrgs.rows.forEach((org: any) => {
        console.log(`      - ${org.name} (ID: ${org.id})`);
        console.log(`        Tenant: ${org.tenant_id}`);
        console.log(`        Active: ${org.is_active}`);
        console.log(`        Parent: ${org.parent_id || 'none'}`);
      });
    }

    // 2. Check current user's permissions
    console.log("\n2️⃣ Checking user permissions:");
    const users = await (store as any).pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.tenant_id
       FROM users u
       WHERE u.is_active = true
       ORDER BY u.created_at
       LIMIT 10`
    );
    
    console.log(`   Found ${users.rows.length} active user(s):`);
    users.rows.forEach((user: any) => {
      console.log(`      - ${user.display_name} (@${user.username})`);
      console.log(`        Role: ${user.role}`);
      console.log(`        Tenant: ${user.tenant_id}`);
    });

    // 3. Check role-node assignments
    console.log("\n3️⃣ Checking role-node assignments:");
    const assignments = await (store as any).pool.query(
      `SELECT rn.user_id, rn.node_id, rn.role,
              u.display_name, u.username,
              n.name as node_name, n.node_type
       FROM role_node_assignments rn
       LEFT JOIN users u ON u.id = rn.user_id
       LEFT JOIN resource_nodes n ON n.id = rn.node_id
       ORDER BY rn.assigned_at DESC
       LIMIT 20`
    );
    
    if (assignments.rows.length === 0) {
      console.log("   ⚠️  No role-node assignments found!");
      console.log("   → Users need to be assigned to organization nodes");
    } else {
      console.log(`   Found ${assignments.rows.length} assignment(s):`);
      assignments.rows.forEach((a: any) => {
        console.log(`      - ${a.display_name} → ${a.node_name} (${a.node_type}) as ${a.role}`);
      });
    }

    // 4. Suggest fixes
    console.log("\n📋 DIAGNOSIS:");
    if (allOrgs.rows.length > 0 && assignments.rows.length === 0) {
      console.log("   ⚠️  ISSUE IDENTIFIED: Organization exists but no users are assigned to it");
      console.log("\n   💡 SOLUTIONS:");
      console.log("   1. Assign your user to the organization node");
      console.log("   2. Grant your user super_admin or company_admin role");
      console.log("   3. Run the fix script below\n");
      
      const org = allOrgs.rows[0];
      const user = users.rows[0];
      
      if (user) {
        console.log("   🔧 Quick fix SQL:");
        console.log(`   -- Option 1: Make user a company_admin
   UPDATE users SET role = 'company_admin' WHERE id = '${user.id}';`);
        
        if (org) {
          console.log(`\n   -- Option 2: Assign user to organization node
   INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
   VALUES ('${user.id}', '${org.id}', 'node_admin', '${user.id}')
   ON CONFLICT DO NOTHING;`);
        }
      }
    }

  } catch (error) {
    console.error("❌ Error during diagnosis:", error);
  } finally {
    await (store as any).pool.end();
  }
}

diagnose();
