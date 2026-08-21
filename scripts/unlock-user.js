#!/usr/bin/env node
import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function unlockUser() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const username = 'mgdhanyamohan';
    
    console.log('🔓 Unlocking user:', username);
    console.log('');

    // Clear failed login attempts (note: correct column names are login_attempts and locked_until)
    const result = await pool.query(
      `UPDATE users 
       SET login_attempts = 0, 
           locked_until = NULL,
           updated_at = NOW()
       WHERE username = $1
       RETURNING id, username, login_attempts, locked_until`,
      [username]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }

    const user = result.rows[0];
    console.log('✅ Account unlocked successfully!');
    console.log('   User ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Login attempts reset to:', user.login_attempts);
    console.log('   Locked until:', user.locked_until || 'Not locked');
    console.log('');
    console.log('🎉 You can now login with:');
    console.log('   Username: mgdhanyamohan');
    console.log('   Use the credential stored in the approved secrets provider.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

unlockUser();
