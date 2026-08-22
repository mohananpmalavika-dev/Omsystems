import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

const tenantId = '00000000-0000-4000-8000-000000000001';

const nodes = await pool.query('SELECT COUNT(*) FROM resource_nodes WHERE tenant_id = $1', [tenantId]);
console.log('Total nodes:', nodes.rows[0].count);

const branches = await pool.query("SELECT COUNT(*) FROM resource_nodes WHERE tenant_id = $1 AND node_type = 'branch'", [tenantId]);
console.log('Branches:', branches.rows[0].count);

const branchList = await pool.query("SELECT name, code FROM resource_nodes WHERE tenant_id = $1 AND node_type = 'branch' LIMIT 5", [tenantId]);
console.log('\nBranch names:');
branchList.rows.forEach(b => console.log('  -', b.name, b.code ? `(${b.code})` : ''));

await pool.end();
