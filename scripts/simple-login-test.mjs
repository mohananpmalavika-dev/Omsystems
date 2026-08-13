import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const r = await pool.query(
      `SELECT u.username, u.status, u.password_hash 
       FROM users u 
       JOIN tenants t ON t.id = u.tenant_id 
       WHERE LOWER(u.username) = LOWER($1) 
       AND ($2::text IS NULL OR t.slug = $2) 
       LIMIT 1`,
      ['mgdhanyamohan', null]
    );

    if (r.rows.length === 0) {
      console.log('User not found');
      await pool.end();
      return;
    }

    const user = r.rows[0];
    console.log('User found:', user.username);
    console.log('Status:', user.status);
    
    const pwdOk = await bcrypt.compare('Thathu@110', user.password_hash);
    console.log('Password correct:', pwdOk);

    if (!pwdOk) {
      console.log('\nTrying variations:');
      const tests = ['Thathu110', 'thathu@110'];
      for (const t of tests) {
        const ok = await bcrypt.compare(t, user.password_hash);
        console.log(`  "${t}":`, ok);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

test();
