import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
console.log('🏢 Organization & Branch Check\n');

// User info
const user = await pool.query(`
  SELECT id, username, tenant_id, role
  FROM users
  WHERE username = 'mgdhanyamohan'
`);

console.log('✅ User:', user.rows[0].username);
console.log('   Role:', user.rows[0].role);
console.log('   Tenant:', user.rows[0].tenant_id);
console.log('');

// Organizational assignments
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

console.log('📋 Organizational Assignments:', assignments.rows.length);
assignments.rows.forEach(a => {
  console.log('   -', a.node_type + ':', a.name, a.is_primary ? '(PRIMARY)' : '');
});
console.log('');

// Resource nodes
const nodes = await pool.query(`
  SELECT node_type, COUNT(*) as count
  FROM resource_nodes
  WHERE tenant_id = $1
  GROUP BY node_type
  ORDER BY node_type
`, [user.rows[0].tenant_id]);

console.log('🏗️ Organization Structure:');
nodes.rows.forEach(n => {
  console.log('   ' + n.node_type + 's:', n.count);
});

// Get branch details
const branches = await pool.query(`
  SELECT id, name, code, is_active
  FROM resource_nodes
  WHERE tenant_id = $1 AND node_type = 'branch'
  ORDER BY name
  LIMIT 5
`, [user.rows[0].tenant_id]);

console.log('');
console.log('🏢 Branches:', branches.rows.length);
branches.rows.forEach(b => {
  console.log('   -', b.name);
  console.log('     ID:', b.id);
  console.log('     Code:', b.code);
  console.log('     Active:', b.is_active);
});

// Get cameras
const cameras = await pool.query(`
  SELECT COUNT(*) as count
  FROM cameras
  WHERE tenant_id = $1
`, [user.rows[0].tenant_id]);

console.log('');
console.log('📹 Cameras:', cameras.rows[0].count);

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
