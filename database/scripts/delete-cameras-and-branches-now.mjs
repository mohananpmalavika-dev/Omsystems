#!/usr/bin/env node
/**
 * Direct Database Deletion Script
 * Deletes all cameras, edge agents, and branches immediately
 */

import pg from 'pg';
const { Pool } = pg;

// Parse DATABASE_URL from .env or use provided
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Connected to database');
    console.log('');
    
    // Get preview counts
    console.log('📊 Current counts:');
    
    const cameraCount = await client.query('SELECT COUNT(*) FROM cameras');
    const edgeAgentCount = await client.query('SELECT COUNT(*) FROM edge_agents');
    const discoveryCount = await client.query('SELECT COUNT(*) FROM camera_discoveries');
    const branchCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'branch'");
    const cameraNodeCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'camera'");
    
    console.log(`  Cameras:            ${cameraCount.rows[0].count}`);
    console.log(`  Edge Agents:        ${edgeAgentCount.rows[0].count}`);
    console.log(`  Camera Discoveries: ${discoveryCount.rows[0].count}`);
    console.log(`  Branch Nodes:       ${branchCount.rows[0].count}`);
    console.log(`  Camera Nodes:       ${cameraNodeCount.rows[0].count}`);
    console.log('');
    
    if (parseInt(cameraCount.rows[0].count) === 0 && 
        parseInt(edgeAgentCount.rows[0].count) === 0 &&
        parseInt(branchCount.rows[0].count) === 0) {
      console.log('✓ No records to delete');
      return;
    }
    
    console.log('🗑️  Deleting...');
    
    await client.query('BEGIN');
    
    try {
      // 1. Delete live sessions
      console.log('  - Deleting live sessions...');
      await client.query('DELETE FROM live_sessions WHERE camera_id IN (SELECT id FROM cameras)');
      
      // 2. Delete incident_cameras (if exists)
      console.log('  - Deleting incident cameras...');
      try {
        await client.query('DELETE FROM incident_cameras WHERE camera_id IN (SELECT id FROM cameras)');
      } catch (err) {
        // Table might not exist
      }
      
      // 3. Delete camera discoveries
      console.log('  - Deleting camera discoveries...');
      await client.query('DELETE FROM camera_discoveries');
      
      // 4. Delete edge scan jobs
      console.log('  - Deleting edge scan jobs...');
      await client.query('DELETE FROM edge_scan_jobs');
      
      // 5. Delete cameras
      console.log('  - Deleting cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      
      // 6. Delete edge agents
      console.log('  - Deleting edge agents...');
      const deletedAgents = await client.query('DELETE FROM edge_agents');
      
      // 7. Delete camera resource nodes (keep for audit trail if needed, but delete if no constraint)
      console.log('  - Attempting to delete camera resource nodes...');
      try {
        await client.query("DELETE FROM resource_nodes WHERE node_type = 'camera'");
        console.log('    ✓ Camera nodes deleted');
      } catch (err) {
        console.log('    ⚠ Camera nodes kept (audit trail preservation)');
      }
      
      // 8. Delete branch resource nodes
      console.log('  - Attempting to delete branch resource nodes...');
      try {
        const deletedBranches = await client.query("DELETE FROM resource_nodes WHERE node_type = 'branch'");
        console.log(`    ✓ Deleted ${deletedBranches.rowCount} branch nodes`);
      } catch (err) {
        console.log(`    ⚠ Branch nodes kept (constraint: ${err.message.substring(0, 100)})`);
      }
      
      await client.query('COMMIT');
      
      console.log('');
      console.log('============================================================');
      console.log('✓ DELETION COMPLETE');
      console.log('============================================================');
      console.log('');
      console.log('Deleted:');
      console.log(`  Cameras:     ${deletedCameras.rowCount}`);
      console.log(`  Edge Agents: ${deletedAgents.rowCount}`);
      console.log('');
      
      // Verify
      const finalCameraCount = await client.query('SELECT COUNT(*) FROM cameras');
      const finalEdgeCount = await client.query('SELECT COUNT(*) FROM edge_agents');
      const finalBranchCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'branch'");
      const finalCameraNodeCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'camera'");
      
      console.log('Remaining:');
      console.log(`  Cameras:      ${finalCameraCount.rows[0].count}`);
      console.log(`  Edge Agents:  ${finalEdgeCount.rows[0].count}`);
      console.log(`  Branch Nodes: ${finalBranchCount.rows[0].count}`);
      console.log(`  Camera Nodes: ${finalCameraNodeCount.rows[0].count}`);
      console.log('');
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
