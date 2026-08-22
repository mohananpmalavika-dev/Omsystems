#!/usr/bin/env node
/**
 * Save camera credentials to database for centralized management
 * This is for 400+ locations with 4000+ cameras - NOT .env files!
 */

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

// Camera credentials to save
const CAMERA_CREDENTIALS = {
  username: process.env.CAMERA_USERNAME,
  password: process.env.CAMERA_PASSWORD,
  branch_id: process.env.CAMERA_BRANCH_ID,
  edge_agent_id: process.env.CAMERA_EDGE_AGENT_ID,
};

if (!DATABASE_URL || Object.values(CAMERA_CREDENTIALS).some((value) => !value)) {
  throw new Error('DATABASE_URL, CAMERA_USERNAME, CAMERA_PASSWORD, CAMERA_BRANCH_ID, and CAMERA_EDGE_AGENT_ID are required at runtime');
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check if camera_credentials table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'camera_credentials'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('📝 Creating camera_credentials table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS camera_credentials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          branch_id UUID NOT NULL,
          edge_agent_id UUID,
          username VARCHAR(100) NOT NULL,
          password VARCHAR(255) NOT NULL,
          scope VARCHAR(50) DEFAULT 'default',
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_camera_creds_branch ON camera_credentials(branch_id);
        CREATE INDEX IF NOT EXISTS idx_camera_creds_agent ON camera_credentials(edge_agent_id);
        CREATE INDEX IF NOT EXISTS idx_camera_creds_ip ON camera_credentials(ip_address);
      `);
      console.log('✅ Table created\n');
    }

    // Insert credentials
    const result = await client.query(`
      INSERT INTO camera_credentials (branch_id, edge_agent_id, username, password, scope)
      VALUES ($1, $2, $3, $4, 'default')
      RETURNING *;
    `, [
      CAMERA_CREDENTIALS.branch_id,
      CAMERA_CREDENTIALS.edge_agent_id,
      CAMERA_CREDENTIALS.username,
      CAMERA_CREDENTIALS.password
    ]);

    console.log('✅ Camera credentials saved to database!');
    console.log('\n📋 Saved credentials:');
    console.log(`   Branch ID: ${CAMERA_CREDENTIALS.branch_id}`);
    console.log(`   Edge Agent ID: ${CAMERA_CREDENTIALS.edge_agent_id}`);
    console.log(`   Username: ${CAMERA_CREDENTIALS.username}`);
    console.log('   Password: [redacted]');
    console.log(`   Record ID: ${result.rows[0].id}`);
    
    // Show all credentials in database
    const allCreds = await client.query(`
      SELECT branch_id, edge_agent_id, username, scope, ip_address, created_at
      FROM camera_credentials
      ORDER BY created_at DESC;
    `);
    
    console.log(`\n📊 Total credentials in database: ${allCreds.rows.length}`);
    
    console.log('\n💡 Next steps:');
    console.log('   1. Update your edge agent to read credentials from database');
    console.log('   2. Deploy this to all 400+ locations');
    console.log('   3. Centrally manage all 4000+ camera credentials\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
