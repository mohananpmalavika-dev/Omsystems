#!/usr/bin/env node

/**
 * Fix Camera Scanner Registration
 * This script ensures the H1 scanner is properly registered in the database
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

// Load DATABASE_URL from .env file
const envContent = readFileSync('.env', 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
const DATABASE_URL = dbUrlMatch ? dbUrlMatch[1] : null;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

const GATEWAY_ID = 'e89264b4-9168-4b1b-8438-d61f7029668f';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';
const GATEWAY_NAME = 'H1';

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Check if gateway exists
    const checkResult = await client.query(
      'SELECT id, name, status FROM edge_gateways WHERE id = $1',
      [GATEWAY_ID]
    );

    if (checkResult.rows.length === 0) {
      console.log('❌ Camera scanner not found in database');
      console.log('📝 Creating camera scanner registration...\n');

      // Insert gateway
      await client.query(
        `INSERT INTO edge_gateways (id, name, branch_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'offline', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [GATEWAY_ID, GATEWAY_NAME, BRANCH_ID]
      );

      console.log('✅ Camera scanner registered successfully!');
      console.log(`   ID: ${GATEWAY_ID}`);
      console.log(`   Name: ${GATEWAY_NAME}`);
      console.log(`   Branch ID: ${BRANCH_ID}\n`);
    } else {
      console.log('✓ Camera scanner already registered');
      console.log(`   ID: ${checkResult.rows[0].id}`);
      console.log(`   Name: ${checkResult.rows[0].name}`);
      console.log(`   Status: ${checkResult.rows[0].status}\n`);
    }

    // Update status to trigger reconnection
    await client.query(
      'UPDATE edge_gateways SET updated_at = NOW() WHERE id = $1',
      [GATEWAY_ID]
    );

    console.log('💡 Next steps:');
    console.log('   1. The scanner should automatically connect within 30 seconds');
    console.log('   2. Refresh your dashboard to see the status change to "Running"');
    console.log('   3. The scanner will start finding cameras automatically\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
