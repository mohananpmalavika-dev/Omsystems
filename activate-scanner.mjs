#!/usr/bin/env node

/**
 * Activate Scanner - Direct Database Registration
 * This registers the H1 scanner directly in the production database
 */

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const GATEWAY_ID = 'e89264b4-9168-4b1b-8438-d61f7029668f';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';
const GATEWAY_NAME = 'H1';

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✓ Connected to production database\n');

    // Check if gateway already exists
    const checkResult = await client.query(
      'SELECT id, name, status FROM edge_agents WHERE id = $1',
      [GATEWAY_ID]
    );

    if (checkResult.rows.length > 0) {
      console.log('✓ Scanner already registered:');
      console.log(`   ID: ${checkResult.rows[0].id}`);
      console.log(`   Name: ${checkResult.rows[0].name}`);
      console.log(`   Status: ${checkResult.rows[0].status}\n`);
      
      // Update to make sure it's active
      await client.query(
        `UPDATE edge_agents 
         SET status = 'offline', last_seen_at = NOW() 
         WHERE id = $1`,
        [GATEWAY_ID]
      );
      console.log('✅ Scanner status refreshed!\n');
    } else {
      console.log('📝 Registering scanner in database...\n');

      // Insert gateway
      await client.query(
        `INSERT INTO edge_agents (id, name, branch_node_id, tenant_id, status, version, created_at, last_seen_at)
         VALUES ($1, $2, $3, '00000000-0000-4000-8000-000000000001', 'offline', '0.1.0', NOW(), NOW())`,
        [GATEWAY_ID, GATEWAY_NAME, BRANCH_ID]
      );

      console.log('✅ Scanner registered successfully!');
      console.log(`   ID: ${GATEWAY_ID}`);
      console.log(`   Name: ${GATEWAY_NAME}`);
      console.log(`   Branch ID: ${BRANCH_ID}\n`);
    }

    console.log('💡 What happens next:');
    console.log('   1. The edge agent will connect within 30 seconds');
    console.log('   2. Refresh your dashboard - status will change to "Running"');
    console.log('   3. Scanner will automatically find cameras on your network\n');
    console.log('✅ Done! Check your dashboard now.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.detail) console.error('   Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
