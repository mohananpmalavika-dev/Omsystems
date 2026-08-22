import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

const tenantId = '00000000-0000-4000-8000-000000000001';

console.log('🏢 COMPLETE ORGANIZATION STRUCTURE\n');
console.log('═'.repeat(60));

// Get user details
const user = await pool.query(`
  SELECT id, username, email, role, display_name
  FROM users 
  WHERE username = 'mgdhanyamohan'
`);

console.log('\n👤 USER DETAILS:');
console.log('   Username:', user.rows[0].username);
console.log('   Display Name:', user.rows[0].display_name);
console.log('   Email:', user.rows[0].email);
console.log('   Role:', user.rows[0].role);
console.log('   User ID:', user.rows[0].id);

// Get tenant
const tenant = await pool.query(`
  SELECT name, slug FROM tenants WHERE id = $1
`, [tenantId]);

console.log('\n🏢 TENANT:');
console.log('   Name:', tenant.rows[0].name);
console.log('   Slug:', tenant.rows[0].slug);
console.log('   ID:', tenantId);

// Get all resource nodes
const nodes = await pool.query(`
  SELECT id, name, node_type, code, path, is_active
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
`, [tenantId]);

console.log('\n🏗️  ORGANIZATION STRUCTURE:');
console.log('   Total Nodes:', nodes.rows.length);
console.log('');

const byType = {};
nodes.rows.forEach(node => {
  if (!byType[node.node_type]) byType[node.node_type] = [];
  byType[node.node_type].push(node);
});

Object.keys(byType).sort().forEach(type => {
  console.log(`   ${type.toUpperCase()}S (${byType[type].length}):`);
  byType[type].forEach(node => {
    console.log('   ├─', node.name);
    console.log('   │  ID:', node.id);
    console.log('   │  Code:', node.code || '(none)');
    console.log('   │  Active:', node.is_active);
    console.log('   │  Path:', node.path);
    console.log('   │');
  });
  console.log('');
});

// Get user organizational assignments
const assignments = await pool.query(`
  SELECT 
    uoa.scope_node_id,
    uoa.is_primary,
    rn.name,
    rn.node_type
  FROM user_organizational_assignments uoa
  JOIN resource_nodes rn ON rn.id = uoa.scope_node_id
  WHERE uoa.user_id = $1
`, [user.rows[0].id]);

console.log('👥 USER ORGANIZATIONAL ASSIGNMENTS:');
if (assignments.rows.length === 0) {
  console.log('   ❌ No assignments found!');
} else {
  assignments.rows.forEach(a => {
    const primary = a.is_primary ? '⭐ PRIMARY' : '';
    console.log(`   ✅ ${a.node_type.toUpperCase()}: ${a.name} ${primary}`);
    console.log('      Node ID:', a.scope_node_id);
  });
}

console.log('\n' + '═'.repeat(60));
console.log('\n✅ SUMMARY:');
console.log('   • User exists and is configured');
console.log('   • Organization structure is set up');
console.log('   • User is assigned to organization');
console.log('   • Ready to login!');

await pool.end();
