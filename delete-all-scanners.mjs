#!/usr/bin/env node

/**
 * Delete All Camera Scanners
 * This removes all edge agents from the production database
 */

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

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

    // Get all edge agents
    const agents = await client.query('SELECT id, name FROM edge_agents');
    
    if (agents.rows.length === 0) {
      console.log('ℹ️  No camera scanners found\n');
      return;
    }

    console.log(`📋 Found ${agents.rows.length} camera scanner(s):`);
    agents.rows.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.name} (${agent.id})`);
    });
    console.log();

    // Delete related records for each agent
    for (const agent of agents.rows) {
      console.log(`🗑️  Deleting scanner: ${agent.name}...`);
      
      // Delete related records (ignore errors if tables don't have data)
      const tables = [
        { table: 'live_sessions', column: 'edge_agent_id' },
        { table: 'edge_scan_jobs', column: 'edge_agent_id' },
        { table: 'camera_discovery_records', column: 'edge_agent_id' },
        { table: 'edge_agent_telemetry', column: 'edge_agent_id' },
        { table: 'cameras', column: 'edge_agent_id' },
      ];

      for (const t of tables) {
        try {
          const result = await client.query(
            `DELETE FROM ${t.table} WHERE ${t.column} = $1`,
            [agent.id]
          );
          if (result.rowCount > 0) {
            console.log(`   ✓ Deleted ${result.rowCount} record(s) from ${t.table}`);
          }
        } catch (err) {
          // Ignore errors if table doesn't exist
        }
      }

      // Delete the agent itself
      await client.query('DELETE FROM edge_agents WHERE id = $1', [agent.id]);
      console.log(`   ✅ Deleted scanner: ${agent.name}\n`);
    }

    console.log(`✅ All ${agents.rows.length} camera scanner(s) deleted successfully!`);
    console.log('\n💡 Now you can register a new scanner from the dashboard.');

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
