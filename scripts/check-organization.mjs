import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('🏢 Checking Organization & Branch Setup\n');
  
  // Get user info
  const userResult = await pool.query(`
    SELECT id, username, tenant_id, role, status
    FROM users
    WHERE username = 'mgdhanyamohan'
  `);
  
  if (userResult.rows.length === 0) {
    console.log('❌ User not found');
    process.exit(1);
  }
  
  const user = userResult.rows[0];
  console.log('✅ User found:');
  console.log('   ID:', user.id);
  console.log('   Username:', user.username);
  console.log('   Tenant ID:', user.tenant_id);
  console.log('   Role:', user.role);
  console.log('\n');
  
  // Check tenant
  const tenantResult = await pool.query(`
    SELECT id, name, slug
    FROM tenants
    WHERE id = $1
  `, [user.tenant_id]);
  
  if (tenantResult.rows.length === 0) {
    console.log('❌ Tenant not found');
  } else {
    const tenant = tenantResult.rows[0];
    console.log('✅ Tenant exists:');
    console.log('   ID:', tenant.id);
    console.log('   Name:', tenant.name);
    console.log('   Slug:', tenant.slug);
  }
  console.log('\n');
  
  // Check organizational assignments
  const orgAssignments = await pool.query(`
    SELECT 
      uoa.id,
      uoa.scope_node_id,
      uoa.is_primary,
      rn.name as node_name,
      rn.node_type,
      rn.code,
      rn.path
    FROM user_organizational_assignments uoa
    JOIN resource_nodes rn ON rn.id = uoa.scope_node_id
    WHERE uoa.user_id = $1
    ORDER BY uoa.is_primary DESC, rn.node_type
  `, [user.id]);
  
  console.log('📋 User Organizational Assignments:', orgAssignments.rows.length);
  if (orgAssignments.rows.length === 0) {
    console.log('   ⚠️ No organizational assignments found!');
    console.log('   This might cause issues with permissions.');
  } else {
    orgAssignments.rows.forEach(assignment => {
      console.log('   -', assignment.node_type.toUpperCase() + ':', assignment.node_name);
      console.log('     ID:', assignment.scope_node_id);
      console.log('     Code:', assignment.code);
      console.log('     Primary:', assignment.is_primary);
      console.log('     Path:', assignment.path);
    });
  }
  console.log('\n');
  
  // Check resource nodes (organization structure)
  const resourceNodes = await pool.query(`
    SELECT 
      id,
      name,
      node_type,
      code,
      path,
      is_active
    FROM resource_nodes
    WHERE tenant_id = $1
    ORDER BY 
      CASE node_type
        WHEN 'company' THEN 1
        WHEN 'region' THEN 2
        WHEN 'branch' THEN 3
        ELSE 4
      END,
      name
  `, [user.tenant_id]);
  
  console.log('🏗️ Organization Structure:', resourceNodes.rows.length, 'nodes');
  
  const byType = {};
  resourceNodes.rows.forEach(node => {
    if (!byType[node.node_type]) byType[node.node_type] = [];
    byType[node.node_type].push(node);
  });
  
  Object.keys(byType).forEach(type => {
    console.log('\n   ' + type.toUpperCase() + 's:', byType[type].length);
    byType[type].forEach(node => {
      console.log('     -', node.name);
      console.log('       ID:', node.id);
      console.log('       Code:', node.code);
      console.log('       Active:', node.is_active);
      console.log('       Path:', node.path);
    });
  });
  
  console.log('\n');
  
  // Check if there's a company node
  const companyNodes = resourceNodes.rows.filter(n => n.node_type === 'company');
  if (companyNodes.length === 0) {
    console.log('❌ No company node found!');
    console.log('   This is required for the organizational hierarchy.');
  } else {
    console.log('✅ Company node(s) exist');
  }
  
  // Check if there are branches
  const branchNodes = resourceNodes.rows.filter(n => n.node_type === 'branch');
  if (branchNodes.length === 0) {
    console.log('⚠️ No branches found!');
    console.log('   You may need to create branches to use the system.');
  } else {
    console.log('✅', branchNodes.length, 'branch(es) exist');
  }
  
  console.log('\n');
  
  // Check cameras
  const cameras = await pool.query(`
    SELECT 
      id,
      display_name,
      branch_node_id,
      status,
      provisioning_status
    FROM cameras
    WHERE tenant_id = $1
    LIMIT 10
  `, [user.tenant_id]);
  
  console.log('📹 Cameras:', cameras.rows.length > 0 ? cameras.rows.length : '0 (none found)');
  if (cameras.rows.length > 0) {
    cameras.rows.forEach(cam => {
      console.log('   -', cam.display_name);
      console.log('     ID:', cam.id);
      console.log('     Branch:', cam.branch_node_id);
      console.log('     Status:', cam.status);
      console.log('     Provisioning:', cam.provisioning_status);
    });
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Code:', error.code);
  if (error.stack) {
    console.error('Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
  }
} finally {
  await pool.end();
}
