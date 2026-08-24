#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

async function quickDelete() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    query_timeout: 30000,
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Check counts
    const cameras = await client.query('SELECT COUNT(*) FROM cameras');
    const agents = await client.query('SELECT COUNT(*) FROM edge_agents');
    const branches = await client.query('SELECT COUNT(*) FROM branches');
    
    console.log(`📊 Current counts:`);
    console.log(`  cameras: ${cameras.rows[0].count}`);
    console.log(`  edge_agents: ${agents.rows[0].count}`);
    console.log(`  branches: ${branches.rows[0].count}\n`);

    if (cameras.rows[0].count === '0' && agents.rows[0].count === '0') {
      console.log('✅ Already clean - nothing to delete');
      return;
    }

    // Delete related records first
    console.log('🗑️  Deleting related records...');
    await client.query('DELETE FROM edge_scan_jobs');
    await client.query('DELETE FROM camera_discoveries');
    await client.query('DELETE FROM live_sessions');
    await client.query('DELETE FROM recording_jobs');
    await client.query('DELETE FROM analytics_rules');
    await client.query('DELETE FROM edge_commands');
    await client.query('DELETE FROM edge_activation_tokens');
    await client.query('DELETE FROM camera_credentials');
    
    // Delete main tables
    const camDel = await client.query('DELETE FROM cameras');
    const agentDel = await client.query('DELETE FROM edge_agents');
    const branchDel = await client.query('DELETE FROM branches');
    
    console.log(`✅ Deleted ${camDel.rowCount} cameras`);
    console.log(`✅ Deleted ${agentDel.rowCount} edge_agents`);
    console.log(`✅ Deleted ${branchDel.rowCount} branches\n`);
    
    console.log('✅ All done!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

quickDelete();
