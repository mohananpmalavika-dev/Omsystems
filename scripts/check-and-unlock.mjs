import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('🔍 Checking user table structure...\n');
  
  // Get all columns
  const columns = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  
  console.log('User table columns:');
  columns.rows.forEach(row => console.log('  -', row.column_name));
  console.log('');
  
  // Get current user state
  console.log('🔍 Checking user mgdhanyamohan...\n');
  const user = await pool.query(`
    SELECT * FROM users WHERE username = 'mgdhanyamohan'
  `);
  
  if (user.rows.length === 0) {
    console.log('❌ User not found');
  } else {
    const u = user.rows[0];
    console.log('Current user state:');
    Object.keys(u).forEach(key => {
      if (key.includes('lock') || key.includes('fail') || key.includes('login') || key === 'status') {
        console.log(`  ${key}: ${u[key]}`);
      }
    });
  }
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
