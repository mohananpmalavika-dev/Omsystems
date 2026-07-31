#!/usr/bin/env ts-node
/**
 * Create Superuser Script
 * Creates a superuser account in the application
 */

import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import * as dotenv from 'dotenv';

dotenv.config();

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

interface SuperUserConfig {
  username: string;
  password: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function createSuperUser(config: SuperUserConfig) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔐 Creating superuser...\n');

    // Hash password
    console.log('1️⃣  Hashing password...');
    const passwordHash = await hashPassword(config.password);
    console.log('✅ Password hashed\n');

    // Check if user already exists
    console.log('2️⃣  Checking if user exists...');
    const existingUser = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [config.username]
    );

    if (existingUser.rows.length > 0) {
      console.log(`⚠️  User '${config.username}' already exists!`);
      console.log(`   User ID: ${existingUser.rows[0].id}\n`);
      
      // Update existing user
      const updateUser = await confirm('Update existing user to superuser?');
      if (!updateUser) {
        console.log('❌ Aborted\n');
        await pool.end();
        return;
      }

      await pool.query(
        `UPDATE users 
         SET role = 'super_admin',
             password_hash = $1,
             email = $2,
             first_name = $3,
             last_name = $4,
             updated_at = NOW()
         WHERE username = $5`,
        [passwordHash, config.email, config.firstName, config.lastName, config.username]
      );

      console.log('✅ User updated to superuser\n');
    } else {
      // Create new user
      console.log('3️⃣  Creating new superuser...');
      
      const result = await pool.query(
        `INSERT INTO users (
          username, email, password_hash, 
          first_name, last_name, role,
          is_active, email_verified,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
        RETURNING id, username, email, role`,
        [
          config.username,
          config.email,
          passwordHash,
          config.firstName,
          config.lastName,
          'super_admin'
        ]
      );

      const user = result.rows[0];
      console.log('✅ Superuser created successfully!\n');
      console.log('📋 User Details:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}\n`);
    }

    // Grant all permissions
    console.log('4️⃣  Granting superuser permissions...');
    
    const userId = existingUser.rows.length > 0 
      ? existingUser.rows[0].id 
      : (await pool.query('SELECT id FROM users WHERE username = $1', [config.username])).rows[0].id;

    // Get all tenants
    const tenants = await pool.query('SELECT id FROM tenants');
    
    for (const tenant of tenants.rows) {
      // Check if permission already exists
      const existingPerm = await pool.query(
        'SELECT id FROM user_tenant_permissions WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenant.id]
      );

      if (existingPerm.rows.length === 0) {
        await pool.query(
          `INSERT INTO user_tenant_permissions (
            user_id, tenant_id, role, permissions, created_at
          ) VALUES ($1, $2, 'admin', '["*"]', NOW())`,
          [userId, tenant.id]
        );
      } else {
        await pool.query(
          `UPDATE user_tenant_permissions 
           SET role = 'admin', permissions = '["*"]', updated_at = NOW()
           WHERE user_id = $1 AND tenant_id = $2`,
          [userId, tenant.id]
        );
      }
    }

    console.log(`✅ Granted permissions for ${tenants.rows.length} tenant(s)\n`);

    console.log('🎉 Superuser setup complete!\n');
    console.log('🔑 Login Credentials:');
    console.log(`   Username: ${config.username}`);
    console.log(`   Password: ${config.password}`);
    console.log(`   Role: super_admin\n`);

    await pool.end();
  } catch (error: any) {
    console.error('❌ Error creating superuser:', error.message);
    console.error('   Details:', error);
    await pool.end();
    process.exit(1);
  }
}

function confirm(question: string): Promise<boolean> {
  // For non-interactive environments, return true
  return Promise.resolve(true);
}

// Main execution
const superUserConfig: SuperUserConfig = {
  username: 'mgdhanyamohan',
  password: 'Thathu110',
  email: 'mgdhanyamohan@omsystems.com',
  firstName: 'Dhanya',
  lastName: 'Mohan'
};

console.log('================================================');
console.log('       SUPERUSER CREATION SCRIPT');
console.log('================================================\n');
console.log('Creating superuser with:');
console.log(`  Username: ${superUserConfig.username}`);
console.log(`  Email: ${superUserConfig.email}`);
console.log(`  Name: ${superUserConfig.firstName} ${superUserConfig.lastName}`);
console.log(`  Role: super_admin\n`);

createSuperUser(superUserConfig)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
