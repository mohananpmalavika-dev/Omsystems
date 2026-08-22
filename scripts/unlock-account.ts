#!/usr/bin/env tsx
/**
 * Unlock Account Script
 * Clears account lockout and failed login attempts
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function unlockAccount(username: string) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined
  });

  try {
    console.log(`🔓 Unlocking account for ${username}...\n`);

    // Find user
    console.log('1️⃣  Finding user...');
    const userResult = await pool.query(
      'SELECT id, username, email FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      console.log(`❌ User '${username}' not found!\n`);
      await pool.end();
      return;
    }

    const user = userResult.rows[0];
    console.log(`✅ User found: ${user.id}\n`);

    // Reset failed login attempts and unlock
    console.log('2️⃣  Clearing failed login attempts...');
    await pool.query(
      `UPDATE users 
       SET login_attempts = 0, 
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );
    console.log('✅ Failed login attempts cleared\n');

    // Also clear any login attempt records if they exist
    console.log('3️⃣  Checking for login attempt records...');
    const attemptCheck = await pool.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name = 'login_attempts'`
    );

    if (attemptCheck.rows.length > 0) {
      await pool.query(
        'DELETE FROM login_attempts WHERE user_id = $1',
        [user.id]
      );
      console.log('✅ Login attempt records cleared\n');
    } else {
      console.log('ℹ️  No login_attempts table found\n');
    }

    console.log('🎉 Account unlocked successfully!\n');
    console.log('🔑 You can now login with:');
    console.log(`   Username: ${username}`);
    console.log('   Use the credential stored in the approved secrets provider.\n');

    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('   Details:', error);
    await pool.end();
    process.exit(1);
  }
}

const username = process.argv[2] || 'mgdhanyamohan';

console.log('================================================');
console.log('       ACCOUNT UNLOCK SCRIPT');
console.log('================================================\n');

unlockAccount(username)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
