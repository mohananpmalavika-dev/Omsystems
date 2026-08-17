#!/usr/bin/env node
/**
 * Direct Database Deletion Script
 * Deletes all cameras and edge agents immediately
 */

import pg from 'pg';
const { Pool } = pg;

// Parse DATABASE_URL from .env or use provided
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omtech_user:uWpzCli9H14xNhMh9m8rA9rpmkE64O84@dpg-d9tmg9id0e5s739i01f0-a.oregon-postgres.render.com/omtech';

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
    
    console.log(`  Cameras:            ${cameraCount.rows[0].count}`);
    console.log(`  Edge Agents:        ${edgeAgentCount.rows[0].count}`);
    console.log(`  Camera Discoveries: ${discoveryCount.rows[0].count}`);
    console.log('');
    
    if (parseInt(cameraCount.rows[0].count) === 0 && parseInt(edgeAgentCount.rows[0].count) === 0) {
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
      
      // 3.5. Delete edge scan jobs
      console.log('  - Deleting edge scan jobs...');
      await client.query('DELETE FROM edge_scan_jobs');
      
      // 4. Delete cameras
      console.log('  - Deleting cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      
      // 5. Keep resource nodes (audit events reference them, and audit is append-only)
      console.log('  - Keeping resource nodes (audit trail preservation)...');
      
      // 6. Delete edge agents
      console.log('  - Deleting edge agents...');
      const deletedAgents = await client.query('DELETE FROM edge_agents');
      
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
      
      console.log('Remaining:');
      console.log(`  Cameras:     ${finalCameraCount.rows[0].count}`);
      console.log(`  Edge Agents: ${finalEdgeCount.rows[0].count}`);
      console.log('');
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
