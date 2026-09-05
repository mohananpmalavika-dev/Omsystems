#!/usr/bin/env node

/**
 * Simple Edge Agent Deletion Script
 * 
 * Deletes all edge agents from the database with minimal checks.
 * 
 * Usage:
 *   CONFIRM=yes DATABASE_URL=postgresql://... node database/scripts/delete-all-edge-agents-simple.js
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (process.env.CONFIRM !== 'yes') {
  console.error('❌ ERROR: Set CONFIRM=yes to proceed');
  console.error('   CONFIRM=yes DATABASE_URL=... node database/scripts/delete-all-edge-agents-simple.js');
  process.exit(1);
}

async function deleteAllEdgeAgents() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' || process.env.DATABASE_SSL === 'require' || DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('aws.com') || DATABASE_URL.includes('amazonaws.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    console.log('🔍 Connecting to database...');
    
    // Get count before deletion
    const countResult = await pool.query('SELECT COUNT(*) as count FROM edge_agents');
    const totalCount = parseInt(countResult.rows[0].count);
    
    if (totalCount === 0) {
      console.log('ℹ️  No edge agents found in the database.');
      return;
    }
    
    console.log(`📊 Found ${totalCount} edge agent(s) in the database.`);
    
    // List agents
    const agentsResult = await pool.query(`
      SELECT 
        ea.id::text,
        ea.name,
        ea.branch_node_id::text,
        rn.name as branch_name
      FROM edge_agents ea
      LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
      ORDER BY rn.name, ea.name
    `);
    
    console.log('\n📋 Agents to be deleted:');
    console.log('─'.repeat(80));
    for (const row of agentsResult.rows) {
      console.log(`  • ${row.name} (Branch: ${row.branch_name || 'Unknown'})`);
    }
    console.log('─'.repeat(80));
    
    console.log('\n🗑️  Deleting related data first...');
    
    // Delete edge_scan_jobs first (they reference edge_agents without CASCADE)
    const scanJobsResult = await pool.query('DELETE FROM edge_scan_jobs WHERE edge_agent_id IN (SELECT id FROM edge_agents)');
    console.log(`   ✓ Deleted ${scanJobsResult.rowCount} edge scan job(s)`);
    
    // Delete camera_discoveries if they reference edge_agents
    try {
      const discoveriesResult = await pool.query('DELETE FROM camera_discoveries WHERE edge_agent_id IN (SELECT id FROM edge_agents)');
      console.log(`   ✓ Deleted ${discoveriesResult.rowCount} camera discoverie(s)`);
    } catch (e) {
      console.log(`   ℹ️  No camera discoveries to delete or table doesn't exist`);
    }
    
    console.log('\n🗑️  Deleting all edge agents...');
    
    // Simple delete - let CASCADE handle edge_commands and operational_health
    const deleteResult = await pool.query('DELETE FROM edge_agents RETURNING id::text, name');
    
    console.log(`\n✅ Successfully deleted ${deleteResult.rowCount} edge agent(s).`);
    
  } catch (error) {
    console.error('\n❌ Error deleting edge agents:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
deleteAllEdgeAgents()
  .then(() => {
    console.log('\n✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed.');
    process.exit(1);
  });
