#!/usr/bin/env node
/**
 * Delete all cameras, edge agents, and branches from Aditivision database
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://aditivision_user:MbtxNqDCGbyKsRhXkRsFI2uandms2MWK@dpg-da0tdi1t0dsc73ahgp1g-a.ohio-postgres.render.com/aditivision';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Connected to Aditivision database');
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
    
    const totalToDelete = parseInt(cameraCount.rows[0].count) + 
                         parseInt(edgeAgentCount.rows[0].count) +
                         parseInt(branchCount.rows[0].count);
    
    if (totalToDelete === 0) {
      console.log('✓ No records to delete');
      return;
    }
    
    console.log('🗑️  Deleting...');
    
    // Main deletion transaction
    await client.query('BEGIN');
    
    try {
      // 1. Delete live sessions
      console.log('  - Deleting live sessions...');
      const liveSessions = await client.query('DELETE FROM live_sessions WHERE camera_id IN (SELECT id FROM cameras)');
      console.log(`    Deleted: ${liveSessions.rowCount}`);
      
      // 2. Delete incident_cameras (if exists)
      console.log('  - Deleting incident cameras...');
      try {
        const incidentCams = await client.query('DELETE FROM incident_cameras WHERE camera_id IN (SELECT id FROM cameras)');
        console.log(`    Deleted: ${incidentCams.rowCount}`);
      } catch (err) {
        console.log('    (table does not exist)');
      }
      
      // 3. Delete camera discoveries
      console.log('  - Deleting camera discoveries...');
      const discoveries = await client.query('DELETE FROM camera_discoveries');
      console.log(`    Deleted: ${discoveries.rowCount}`);
      
      // 4. Delete edge scan jobs
      console.log('  - Deleting edge scan jobs...');
      const scanJobs = await client.query('DELETE FROM edge_scan_jobs');
      console.log(`    Deleted: ${scanJobs.rowCount}`);
      
      // 5. Delete cameras
      console.log('  - Deleting cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      console.log(`    Deleted: ${deletedCameras.rowCount}`);
      
      // 6. Delete edge agents
      console.log('  - Deleting edge agents...');
      const deletedAgents = await client.query('DELETE FROM edge_agents');
      console.log(`    Deleted: ${deletedAgents.rowCount}`);
      
      // 7. Try to delete camera resource nodes
      console.log('  - Deleting camera resource nodes...');
      try {
        const camNodes = await client.query("DELETE FROM resource_nodes WHERE node_type = 'camera'");
        console.log(`    Deleted: ${camNodes.rowCount} camera nodes`);
      } catch (err) {
        console.log(`    ⚠ Kept (audit trail)`);
      }
      
      await client.query('COMMIT');
      console.log('  ✓ Main deletion committed');
      
    } catch (mainErr) {
      await client.query('ROLLBACK');
      throw mainErr;
    }
    
    // Try to delete branch nodes in a separate transaction (may fail due to audit)
    try {
      await client.query('BEGIN');
      console.log('  - Deleting branch resource nodes...');
      const branchNodes = await client.query("DELETE FROM resource_nodes WHERE node_type = 'branch'");
      await client.query('COMMIT');
      console.log(`    Deleted: ${branchNodes.rowCount} branch nodes`);
    } catch (branchErr) {
      await client.query('ROLLBACK');
      console.log(`    ⚠ Kept (audit trail)`);
    }
    
    console.log('');
    console.log('============================================================');
    console.log('✓ DELETION COMPLETE');
    console.log('============================================================');
    console.log('');
    
    // Final verification
    const finalCameraCount = await client.query('SELECT COUNT(*) FROM cameras');
    const finalEdgeCount = await client.query('SELECT COUNT(*) FROM edge_agents');
    const finalBranchCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'branch'");
    const finalCameraNodeCount = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'camera'");
    const finalDiscoveryCount = await client.query('SELECT COUNT(*) FROM camera_discoveries');
    
    console.log('Final counts:');
    console.log(`  Cameras:            ${finalCameraCount.rows[0].count}`);
    console.log(`  Edge Agents:        ${finalEdgeCount.rows[0].count}`);
    console.log(`  Camera Discoveries: ${finalDiscoveryCount.rows[0].count}`);
    console.log(`  Branch Nodes:       ${finalBranchCount.rows[0].count}`);
    console.log(`  Camera Nodes:       ${finalCameraNodeCount.rows[0].count}`);
    console.log('');
    
    if (parseInt(finalCameraCount.rows[0].count) === 0 && 
        parseInt(finalEdgeCount.rows[0].count) === 0) {
      console.log('✅ All cameras and edge agents successfully deleted!');
      if (parseInt(finalBranchCount.rows[0].count) > 0) {
        console.log('⚠️  Branch nodes kept (referenced by audit trail)');
      }
    } else {
      console.log('⚠️  Some records may remain due to constraints');
    }
    console.log('');
    
  } catch (err) {
    console.error('');
    console.error('❌ Error:', err.message);
    process.exit(1);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
