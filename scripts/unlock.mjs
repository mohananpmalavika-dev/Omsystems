import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await pool.query(
  "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE username = 'mgdhanyamohan'"
);

const result = await pool.query(
  "SELECT username, login_attempts, locked_until, status FROM users WHERE username = 'mgdhanyamohan'"
);

console.log('✅ Account unlocked!');
console.log(result.rows[0]);

await pool.end();
