#!/usr/bin/env node

/**
 * Delete All Branch Gateways (Edge Agents)
 * 
 * This script deletes all edge agents (branch gateways) from the database.
 * 
 * WARNING: This is a destructive operation that will:
 * - Delete all edge agents
 * - CASCADE delete: edge_commands, operational_health records
 * - SET NULL: device_identities.edge_agent_id, device_ip_observations.edge_agent_id,
 *   camera_discovery_credentials.edge_agent_id
 * - Orphan: cameras.edge_agent_id (may need manual cleanup)
 * 
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host/db node database/scripts/delete-all-edge-agents.js
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('   Example: DATABASE_URL=postgresql://user:pass@host/db node database/scripts/delete-all-edge-agents.js');
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
    console.log('🔍 Checking current edge agents...');
    
    // Get count before deletion
    const countResult = await pool.query('SELECT COUNT(*) as count FROM edge_agents');
    const totalCount = parseInt(countResult.rows[0].count);
    
    if (totalCount === 0) {
      console.log('ℹ️  No edge agents found in the database.');
      return;
    }
    
    console.log(`📊 Found ${totalCount} edge agent(s) in the database.`);
    
    // Get details by branch
    const detailsResult = await pool.query(`
      SELECT 
        ea.branch_node_id::text,
        rn.name as branch_name,
        COUNT(ea.id) as agent_count,
        COUNT(DISTINCT c.id) as camera_count
      FROM edge_agents ea
      LEFT JOIN resource_nodes rn ON ea.branch_node_id = rn.id
      LEFT JOIN cameras c ON c.edge_agent_id = ea.id
      GROUP BY ea.branch_node_id, rn.name
      ORDER BY agent_count DESC
    `);
    
    console.log('\n📋 Branch Gateway Summary:');
    console.log('─'.repeat(80));
    for (const row of detailsResult.rows) {
      console.log(`  Branch: ${row.branch_name || 'Unknown'} (${row.branch_node_id})`);
      console.log(`    └─ Agents: ${row.agent_count}, Associated Cameras: ${row.camera_count}`);
    }
    console.log('─'.repeat(80));
    
    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete ALL edge agents and related data.');
    console.log('   - Edge commands will be CASCADE deleted');
    console.log('   - Operational health records will be CASCADE deleted');
    console.log('   - Device identities will have edge_agent_id set to NULL');
    console.log('   - Cameras will be orphaned (edge_agent_id will remain but agents will be gone)');
    
    // For non-interactive execution, check for CONFIRM environment variable
    if (process.env.CONFIRM !== 'yes') {
      console.log('\n❌ Deletion cancelled. Set CONFIRM=yes to proceed:');
      console.log('   CONFIRM=yes DATABASE_URL=... node database/scripts/delete-all-edge-agents.js');
      return;
    }
    
    console.log('\n🗑️  Proceeding with deletion...');
    
    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get counts of related data that will be affected (safely handle missing tables)
      console.log(`\n📊 Checking related data...`);
      
      const relatedData = {};
      
      try {
        const commandsResult = await client.query(`SELECT COUNT(*) as count FROM edge_commands WHERE edge_agent_id IN (SELECT id FROM edge_agents)`);
        relatedData.commands_count = parseInt(commandsResult.rows[0].count);
      } catch (e) {
        relatedData.commands_count = 0;
      }
      
      try {
        const healthResult = await client.query(`SELECT COUNT(*) as count FROM operational_health WHERE edge_agent_id IN (SELECT id FROM edge_agents)`);
        relatedData.health_records_count = parseInt(healthResult.rows[0].count);
      } catch (e) {
        relatedData.health_records_count = 0;
      }
      
      try {
        const scanResult = await client.query(`SELECT COUNT(*) as count FROM edge_scan_jobs WHERE edge_agent_id IN (SELECT id FROM edge_agents)`);
        relatedData.scan_jobs_count = parseInt(scanResult.rows[0].count);
      } catch (e) {
        relatedData.scan_jobs_count = 0;
      }
      
      try {
        const discoveriesResult = await client.query(`SELECT COUNT(*) as count FROM camera_discoveries WHERE edge_agent_id IN (SELECT id FROM edge_agents)`);
        relatedData.discoveries_count = parseInt(discoveriesResult.rows[0].count);
      } catch (e) {
        relatedData.discoveries_count = 0;
      }
      
      console.log(`\n📊 Related data to be affected:`);
      console.log(`   - Edge Commands: ${relatedData.commands_count} (will be CASCADE deleted)`);
      console.log(`   - Operational Health Records: ${relatedData.health_records_count} (will be CASCADE deleted if table exists)`);
      console.log(`   - Edge Scan Jobs: ${relatedData.scan_jobs_count} (will be orphaned)`);
      console.log(`   - Camera Discoveries: ${relatedData.discoveries_count} (will be orphaned)`);
      
      // Delete all edge agents (CASCADE will handle related tables)
      const deleteResult = await client.query('DELETE FROM edge_agents RETURNING id::text, name, branch_node_id::text');
      
      await client.query('COMMIT');
      
      console.log(`\n✅ Successfully deleted ${deleteResult.rowCount} edge agent(s).`);
      console.log('\nDeleted agents:');
      for (const row of deleteResult.rows) {
        console.log(`   - ${row.name} (ID: ${row.id}, Branch: ${row.branch_node_id})`);
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('\n❌ Error deleting edge agents:', error);
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
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
