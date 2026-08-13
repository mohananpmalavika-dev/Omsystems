import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  const r = await pool.query(
    'SELECT username, password_hash FROM users WHERE username = $1',
    ['mgdhanyamohan']
  );
  
  if (r.rows.length === 0) {
    console.log('User not found');
    process.exit(1);
  }
  
  const user = r.rows[0];
  console.log('User:', user.username);
  
  const passwordCorrect = await bcrypt.compare('Thathu@110', user.password_hash);
  console.log('Password "Thathu@110" is correct:', passwordCorrect);
  
  const passwordWrong = await bcrypt.compare('Thathu110', user.password_hash);
  console.log('Password "Thathu110" is correct:', passwordWrong);
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
