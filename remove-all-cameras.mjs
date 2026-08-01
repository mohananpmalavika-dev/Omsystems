#!/usr/bin/env node
/**
 * Remove All Cameras from Database
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function removeAllCameras() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // First, get count of cameras
    const countResult = await client.query('SELECT COUNT(*) as count FROM cameras');
    const cameraCount = parseInt(countResult.rows[0].count);
    
    console.log(`📊 Found ${cameraCount} camera(s) in database\n`);
    
    if (cameraCount === 0) {
      console.log('✅ No cameras to remove!\n');
      return;
    }

    // Show cameras before deletion
    const camerasResult = await client.query(`
      SELECT id, model, ip_address, status, branch_node_id, edge_agent_id
      FROM cameras
      ORDER BY created_at
    `);
    
    console.log('📹 Cameras to be removed:');
    console.log('='.repeat(80));
    camerasResult.rows.forEach((cam, index) => {
      console.log(`${index + 1}. ${cam.model || 'Unknown Model'} (${cam.id})`);
      console.log(`   IP: ${cam.ip_address || 'N/A'}`);
      console.log(`   Status: ${cam.status}`);
      console.log(`   Branch: ${cam.branch_node_id || 'N/A'}`);
      console.log(`   Edge Agent: ${cam.edge_agent_id || 'N/A'}`);
      console.log('');
    });
    console.log('='.repeat(80));
    console.log('');

    // Delete all cameras
    console.log('🗑️  Deleting related records...');
    
    // Delete live_sessions first
    const liveSessionsResult = await client.query('DELETE FROM live_sessions');
    console.log(`   - Deleted ${liveSessionsResult.rowCount} live session(s)`);
    
    // Delete cameras
    console.log('🗑️  Deleting all cameras...');
    const deleteResult = await client.query('DELETE FROM cameras');
    
    console.log(`✅ Successfully deleted ${deleteResult.rowCount} camera(s)\n`);

    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM cameras');
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    if (remainingCount === 0) {
      console.log('✅ All cameras removed successfully!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} camera(s) still remain in database`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed\n');
  }
}

removeAllCameras();
