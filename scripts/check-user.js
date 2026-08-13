#!/usr/bin/env node
import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function checkUser() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking user mgdhanyamohan...\n');

    const result = await pool.query(
      `SELECT id, username, email, role, status, "password_hash", identity_subject, tenant_id 
       FROM users 
       WHERE username = $1`,
      ['mgdhanyamohan']
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found in database');
      return;
    }

    const user = result.rows[0];
    console.log('✅ User found:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   Status:', user.status);
    console.log('   Identity Subject:', user.identity_subject);
    console.log('   Tenant ID:', user.tenant_id);
    console.log('   Password Hash:', user.password_hash ? 'exists' : 'missing');
    
    // Test password verification
    console.log('\n🔍 Testing password verification...');
    const testPassword = 'Thathu@110';
    const isValid = await bcrypt.compare(testPassword, user.password_hash);
    console.log(`   Password "Thathu@110": ${isValid ? '✅ Valid' : '❌ Invalid'}`);

    // Also test with the password from the script
    const testPassword2 = 'Thathu110';
    const isValid2 = await bcrypt.compare(testPassword2, user.password_hash);
    console.log(`   Password "Thathu110": ${isValid2 ? '✅ Valid' : '❌ Invalid'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkUser();
