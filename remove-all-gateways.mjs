#!/usr/bin/env node
/**
 * Remove All Gateways (Edge Agents) from Database
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function removeAllGateways() {
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

    // First, get count of edge agents
    const countResult = await client.query('SELECT COUNT(*) as count FROM edge_agents');
    const gatewayCount = parseInt(countResult.rows[0].count);
    
    console.log(`📊 Found ${gatewayCount} gateway(s) in database\n`);
    
    if (gatewayCount === 0) {
      console.log('✅ No gateways to remove!\n');
      return;
    }

    // Show gateways before deletion
    const gatewaysResult = await client.query(`
      SELECT id, name, version, status, last_seen_at, branch_node_id, created_at
      FROM edge_agents
      ORDER BY created_at
    `);
    
    console.log('🌐 Gateways to be removed:');
    console.log('='.repeat(80));
    gatewaysResult.rows.forEach((gw, index) => {
      console.log(`${index + 1}. ${gw.name} (${gw.id})`);
      console.log(`   Version: ${gw.version || 'N/A'}`);
      console.log(`   Status: ${gw.status}`);
      console.log(`   Branch: ${gw.branch_node_id || 'N/A'}`);
      console.log(`   Last Seen: ${gw.last_seen_at || 'Never'}`);
      console.log(`   Created: ${gw.created_at}`);
      console.log('');
    });
    console.log('='.repeat(80));
    console.log('');

    // Check for dependent records
    console.log('🔍 Checking for dependent records...\n');
    
    const cameraCount = await client.query('SELECT COUNT(*) as count FROM cameras');
    console.log(`   - Cameras: ${cameraCount.rows[0].count}`);
    
    const telemetryCount = await client.query('SELECT COUNT(*) as count FROM operational_health_telemetry');
    console.log(`   - Telemetry records: ${telemetryCount.rows[0].count}`);
    
    const discoveryCount = await client.query('SELECT COUNT(*) as count FROM camera_discoveries WHERE edge_agent_id IS NOT NULL');
    console.log(`   - Discovery records: ${discoveryCount.rows[0].count}`);
    
    console.log('');

    // Delete all related records first
    console.log('🗑️  Deleting related records...');
    
    // Delete cameras
    const camerasDeleted = await client.query('DELETE FROM cameras WHERE edge_agent_id IS NOT NULL');
    console.log(`   - Deleted ${camerasDeleted.rowCount} camera(s)`);
    
    // Delete telemetry
    const telemetryDeleted = await client.query('DELETE FROM operational_health_telemetry WHERE edge_agent_id IS NOT NULL');
    console.log(`   - Deleted ${telemetryDeleted.rowCount} telemetry record(s)`);
    
    // Delete discoveries
    const discoveriesDeleted = await client.query('DELETE FROM camera_discoveries WHERE edge_agent_id IS NOT NULL');
    console.log(`   - Deleted ${discoveriesDeleted.rowCount} discovery record(s)`);
    
    // Delete scan jobs
    const scanJobsDeleted = await client.query('DELETE FROM edge_scan_jobs WHERE edge_agent_id IS NOT NULL');
    console.log(`   - Deleted ${scanJobsDeleted.rowCount} scan job(s)`);
    
    console.log('');
    
    // Delete all gateways
    console.log('🗑️  Deleting all gateways...');
    const deleteResult = await client.query('DELETE FROM edge_agents');
    
    console.log(`✅ Successfully deleted ${deleteResult.rowCount} gateway(s)\n`);

    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM edge_agents');
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    if (remainingCount === 0) {
      console.log('✅ All gateways removed successfully!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} gateway(s) still remain in database`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed\n');
  }
}

removeAllGateways();
