import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/krypton'
});

async function main() {
  try {
    console.log('=== BRANCHES ===');
    const branches = await pool.query('SELECT id, name, code FROM branch_nodes ORDER BY name');
    console.table(branches.rows);

    console.log('\n=== EDGE AGENTS ===');
    const agents = await pool.query(`
      SELECT a.id, a.name, a.ip_address, a.status, a.last_seen_at, a.branch_node_id, b.name as branch_name, a.public_media_url, a.local_media_url
      FROM edge_agents a
      LEFT JOIN branch_nodes b ON a.branch_node_id = b.id
      ORDER BY a.last_seen_at DESC
    `);
    console.table(agents.rows);

    console.log('\n=== CAMERAS MATCHING 172.29.55 or North ===');
    const cams = await pool.query(`
      SELECT c.id, c.name, c.ip_address, c.status, c.branch_node_id, b.name as branch_name, c.edge_agent_id, c.stream_url
      FROM cameras c
      LEFT JOIN branch_nodes b ON c.branch_node_id = b.id
      WHERE c.ip_address::text LIKE '%172.29.55%' 
         OR c.name ILIKE '%north%' 
         OR b.name ILIKE '%north%'
         OR c.stream_url ILIKE '%172.29.55%'
    `);
    console.table(cams.rows);

    console.log('\n=== DISCOVERED CAMERAS MATCHING 172.29.55 or North ===');
    const disc = await pool.query(`
      SELECT d.id, d.display_name, d.ip_address, d.status, d.stream_verified, d.credentials_required, d.branch_id, b.name as branch_name, d.discovered_at
      FROM discovered_cameras d
      LEFT JOIN branch_nodes b ON d.branch_id = b.id
      WHERE d.ip_address::text LIKE '%172.29.55%' 
         OR d.display_name ILIKE '%north%'
         OR b.name ILIKE '%north%'
      ORDER BY d.discovered_at DESC
    `);
    console.table(disc.rows);

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await pool.end();
  }
}

main();
