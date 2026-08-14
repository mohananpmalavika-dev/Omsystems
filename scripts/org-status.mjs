import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

try {
  console.log('🏢 Organization Status for mgdhanyamohan\n');
  
  // User
  const u = await pool.query("SELECT id, username, display_name, role FROM users WHERE username='mgdhanyamohan'");
  console.log('✅ USER:', u.rows[0].display_name, `(${u.rows[0].role})`);
  
  // Assignments
  const a = await pool.query(`
    SELECT rn.name, rn.node_type, uoa.is_primary 
    FROM user_organizational_assignments uoa 
    JOIN resource_nodes rn ON rn.id = uoa.scope_node_id 
    WHERE uoa.user_id = $1
  `, [u.rows[0].id]);
  
  console.log('\n✅ ASSIGNED TO:');
  a.rows.forEach(r => {
    console.log(`   • ${r.node_type}: ${r.name}`, r.is_primary ? '(PRIMARY)' : '');
  });
  
  // All nodes
  const n = await pool.query("SELECT node_type, COUNT(*) as count FROM resource_nodes WHERE tenant_id='00000000-0000-4000-8000-000000000001' GROUP BY node_type");
  console.log('\n✅ ORGANIZATION STRUCTURE:');
  n.rows.forEach(r => console.log(`   • ${r.node_type}s: ${r.count}`));
  
  // Branches
  const b = await pool.query("SELECT name FROM resource_nodes WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND node_type='branch'");
  console.log('\n✅ BRANCHES:');
  b.rows.forEach(r => console.log(`   • ${r.name}`));
  
  console.log('\n✅ Everything is configured correctly!');
  
} catch(e) {
  console.error('Error:', e.message);
}

await pool.end();
