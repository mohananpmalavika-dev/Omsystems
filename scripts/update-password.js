#!/usr/bin/env node
import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function updatePassword() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const username = 'mgdhanyamohan';
    const newPassword = process.env.NEW_PASSWORD;
    if (!newPassword) throw new Error('NEW_PASSWORD is required');

    console.log('🔐 Updating password for user:', username);
    console.log('   New password: <provided via NEW_PASSWORD>\n');

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed\n');

    // Update the user's password
    const result = await pool.query(
      `UPDATE users 
       SET "password_hash" = $1, 
           "updated_at" = NOW()
       WHERE "username" = $2
       RETURNING id, username, email`,
      [passwordHash, username]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ Password updated successfully!');
    console.log('   User ID:', result.rows[0].id);
    console.log('   Username:', result.rows[0].username);
    console.log('   Email:', result.rows[0].email);
    
    // Verify the password works
    console.log('\n🔍 Verifying new password...');
    const isValid = await bcrypt.compare(newPassword, passwordHash);
    console.log(`   ${isValid ? '✅ Password verification successful' : '❌ Password verification failed'}`);

    console.log('\n🎉 You can now login with:');
    console.log(`   Username: ${username}`);
    console.log('   Password updated; retrieve the new value from your secure input.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

updatePassword();
