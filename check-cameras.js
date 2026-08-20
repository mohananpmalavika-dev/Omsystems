import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4',
  ssl: { rejectUnauthorized: false }
});

async function checkCameras() {
  try {
    console.log('Checking cameras table schema...');
    const schema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cameras' 
      ORDER BY ordinal_position
    `);
    console.log('Cameras table columns:', schema.rows.map(r => r.column_name).join(', '));

    console.log('\nChecking cameras table...');
    const cameras = await pool.query('SELECT * FROM cameras ORDER BY created_at DESC LIMIT 20');
    console.log(`\nFound ${cameras.rows.length} cameras:\n`);
    cameras.rows.forEach(c => {
      console.log(JSON.stringify(c, null, 2));
    });

    console.log('\n\nChecking discovered_cameras table...');
    const discovered = await pool.query('SELECT * FROM discovered_cameras ORDER BY discovered_at DESC LIMIT 20');
    console.log(`\nFound ${discovered.rows.length} discovered cameras:\n`);
    discovered.rows.forEach(c => {
      console.log(JSON.stringify(c, null, 2));
    });

    console.log('\n\nChecking branches...');
    const branches = await pool.query('SELECT id, name, created_at FROM nodes WHERE type = $1', ['branch']);
    console.log(`\nFound ${branches.rows.length} branches:\n`);
    branches.rows.forEach(b => {
      console.log(`Branch: ${b.name} | ID: ${b.id}`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

checkCameras();
