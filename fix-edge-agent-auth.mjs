#!/usr/bin/env node
/**
 * Fix Edge Agent Authentication - Direct Database Fix
 */

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const EDGE_AGENT_ID = '6a570d4a-2c71-415f-b59a-643cf50d55c5';
const EDGE_BRIDGE_SHARED_KEY = process.env.EDGE_BRIDGE_SHARED_KEY || (() => {
  console.error('ERROR: EDGE_BRIDGE_SHARED_KEY is not set in the environment. This script will not inject a shared key into the database when the key is not explicitly provided.\nSet EDGE_BRIDGE_SHARED_KEY in your environment to continue (development only).');
  process.exit(1);
})();

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Check if edge agent exists
    const checkAgent = await client.query(
      'SELECT id, name, status, branch_node_id, created_at FROM edge_agents WHERE id = $1',
      [EDGE_AGENT_ID]
    );

    if (checkAgent.rows.length === 0) {
      console.log('❌ Edge agent not found in database!');
      console.log('   Creating new edge agent...\n');
      
      await client.query(
        `INSERT INTO edge_agents (id, name, branch_node_id, tenant_id, status, version, created_at, last_seen_at)
         VALUES ($1, 'Main Scanner', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'offline', '0.1.0', NOW(), NOW())`,
        [EDGE_AGENT_ID]
      );
      
      console.log('✅ Edge agent created successfully!\n');
    } else {
      console.log('✓ Edge agent found:');
      console.log(`   ID: ${checkAgent.rows[0].id}`);
      console.log(`   Name: ${checkAgent.rows[0].name}`);
      console.log(`   Status: ${checkAgent.rows[0].status}`);
      console.log(`   Branch: ${checkAgent.rows[0].branch_node_id}\n`);
    }

    // Check bridge credentials table
    const checkCreds = await client.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'edge_bridge_credentials') as exists`
    );

    if (checkCreds.rows[0].exists) {
      console.log('✓ Checking bridge credentials...');
      
      const creds = await client.query(
        'SELECT agent_id, created_at FROM edge_bridge_credentials WHERE agent_id = $1',
        [EDGE_AGENT_ID]
      );

      if (creds.rows.length === 0) {
        console.log('   Creating bridge credential...\n');
        await client.query(
          `INSERT INTO edge_bridge_credentials (agent_id, shared_key, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (agent_id) DO UPDATE SET shared_key = $2, updated_at = NOW()`,
          [EDGE_AGENT_ID, EDGE_BRIDGE_SHARED_KEY]
        );
        console.log('✅ Bridge credential created!\n');
      } else {
        console.log('   Updating bridge credential...\n');
        await client.query(
          `UPDATE edge_bridge_credentials SET shared_key = $2, updated_at = NOW() WHERE agent_id = $1`,
          [EDGE_AGENT_ID, EDGE_BRIDGE_SHARED_KEY]
        );
        console.log('✅ Bridge credential updated!\n');
      }
    } else {
      console.log('⚠️  Bridge credentials table does not exist - using legacy auth\n');
    }

    // Update agent status
    await client.query(
      'UPDATE edge_agents SET status = $2, last_seen_at = NOW() WHERE id = $1',
      [EDGE_AGENT_ID, 'offline']
    );

    console.log('✅ Edge agent authentication fixed!');
    console.log('\n💡 Now run: cd C:\\Omsystems\\edge-agent && node start-with-env.mjs --scan-once\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
