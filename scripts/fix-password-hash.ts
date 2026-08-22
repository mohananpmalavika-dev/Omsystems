#!/usr/bin/env tsx
/**
 * Fix Password Hash Script
 * Updates the superuser password to use scrypt instead of bcrypt
 */

import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function fixPasswordHash() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined
  });

  try {
    console.log('🔐 Fixing password hash for mgdhanyamohan...\n');

    // Hash password using scrypt (same as auth system)
    const password = process.env.NEW_PASSWORD;
    if (!password) throw new Error('NEW_PASSWORD is required');
    const username = 'mgdhanyamohan';
    
    console.log('1️⃣  Hashing password with scrypt...');
    const passwordHash = await hashPassword(password);
    console.log('✅ Password hashed:', passwordHash.substring(0, 30) + '...\n');

    // Check if user exists
    console.log('2️⃣  Checking if user exists...');
    const existingUser = await pool.query(
      'SELECT id, username, email FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length === 0) {
      console.log(`❌ User '${username}' not found!\n`);
      console.log('Creating user...\n');
      
      // Get default tenant
      const tenant = await pool.query('SELECT id FROM tenants LIMIT 1');
      if (tenant.rows.length === 0) {
        console.error('❌ No tenant found. Please create a tenant first.');
        await pool.end();
        return;
      }

      // Create new user
      const result = await pool.query(
        `INSERT INTO users (
          tenant_id, username, email, password_hash, 
          display_name, role, status, active,
          must_change_password, email_verified,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, true, NOW(), NOW())
        RETURNING id, username, email, role`,
        [
          tenant.rows[0].id,
          username,
          'mgdhanyamohan@omsystems.com',
          passwordHash,
          'Dhanya Mohan',
          'super_admin',
          'active'
        ]
      );

      console.log('✅ User created successfully!');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Username: ${result.rows[0].username}`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log(`   Role: ${result.rows[0].role}\n`);
    } else {
      console.log(`✅ User found: ${existingUser.rows[0].id}\n`);
      
      // Update password hash
      console.log('3️⃣  Updating password hash...');
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2',
        [passwordHash, username]
      );
      console.log('✅ Password hash updated\n');
    }

    console.log('🎉 Password fix complete!\n');
    console.log('🔑 You can now login with:');
    console.log(`   Username: ${username}`);
    console.log('   Password hash updated; retrieve the new value from your secure input.\n');

    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

console.log('================================================');
console.log('       PASSWORD HASH FIX SCRIPT');
console.log('================================================\n');

fixPasswordHash()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
