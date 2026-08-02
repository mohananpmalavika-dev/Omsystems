#!/usr/bin/env node
/**
 * Reset Login Attempts
 * Clears failed login attempts for a user
 */

import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function resetLoginAttempts() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const username = 'mgdhanyamohan';

    console.log(`Resetting login attempts for: ${username}\n`);

    const result = await pool.query(`
      UPDATE users
      SET login_attempts = 0,
          locked_until = NULL
      WHERE LOWER(username) = LOWER($1)
      RETURNING id, username, login_attempts, locked_until
    `, [username]);

    if (result.rows.length === 0) {
      console.log('❌ User not found');
    } else {
      const user = result.rows[0];
      console.log('✅ Login attempts reset!');
      console.log(`   User: ${user.username}`);
      console.log(`   Login Attempts: ${user.login_attempts}`);
      console.log(`   Locked Until: ${user.locked_until || 'not locked'}\n`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

resetLoginAttempts();
