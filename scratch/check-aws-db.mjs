import pg from 'pg';
const { Client } = pg;

async function checkAWS() {
  const client = new Client({
    host: '3.7.216.169',
    port: 5432,
    database: 'sentinel_grid',
    user: 'sentinel_admin',
    password: process.env.AWS_DB_PASSWORD || 'sentinel_admin',
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('Connected to AWS postgres successfully!');
    
    // Check organizations
    const orgs = await client.query(`SELECT id, name, node_type, parent_id FROM resource_nodes;`);
    console.log(`Total resource_nodes in AWS: ${orgs.rows.length}`);
    for (const r of orgs.rows) {
      console.log(` - [${r.node_type}] ${r.name} (${r.id}) parent: ${r.parent_id}`);
    }

    // Check cameras
    const cams = await client.query(`SELECT id, channel, status, branch_node_id, resource_node_id FROM cameras;`);
    console.log(`Total cameras in AWS: ${cams.rows.length}`);
    for (const c of cams) {
      console.log(` - Camera ${c.id}: status=${c.status}, branch=${c.branch_node_id}`);
    }

    // Check users
    const users = await client.query(`SELECT id, username, email, role FROM users;`);
    console.log(`Total users in AWS: ${users.rows.length}`);
    for (const u of users.rows) {
      console.log(` - User ${u.username} (${u.role})`);
    }

    await client.end();
  } catch (err) {
    console.log('Error connecting to AWS DB:', err.message);
  }
}

checkAWS();
