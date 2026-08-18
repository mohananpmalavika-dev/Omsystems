#!/usr/bin/env node
/**
 * DELETE ALL EDGE AGENTS AND CAMERAS
 * 
 * WARNING: This is a DESTRUCTIVE operation!
 * This will delete all edge agents (gateways) and cameras from the database.
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const { Pool } = pg;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n========================================');
  console.log('  🚨 DESTRUCTIVE OPERATION WARNING 🚨');
  console.log('========================================\n');
  console.log('This script will DELETE ALL:');
  console.log('  ❌ Edge Agents (Gateways)');
  console.log('  ❌ Cameras');
  console.log('  ❌ Related health data, commands, telemetry');
  console.log('\n========================================\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL not found in environment');
    process.exit(1);
  }

  const maskedUrl = databaseUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://***:***@');
  console.log(`📊 Database: ${maskedUrl}\n`);

  // First confirmation
  const confirm1 = await question('⚠️  Type "DELETE ALL" to proceed: ');
  if (confirm1 !== 'DELETE ALL') {
    console.log('✅ Operation cancelled.');
    rl.close();
    process.exit(0);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('\n📊 Current counts:');
    
    const edgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
    const cameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
    
    console.log(`  Edge Agents: ${edgeCount.rows[0].count}`);
    console.log(`  Cameras: ${cameraCount.rows[0].count}`);

    if (edgeCount.rows[0].count === '0' && cameraCount.rows[0].count === '0') {
      console.log('\n✅ No edge agents or cameras to delete.');
      rl.close();
      await pool.end();
      process.exit(0);
    }

    console.log('\n🔍 Running preview (will rollback)...\n');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete edge agent related data
      console.log('  Deleting edge agent health...');
      await client.query('DELETE FROM edge_agent_health');
      
      console.log('  Deleting edge upgrade runs...');
      await client.query('DELETE FROM edge_upgrade_runs');
      
      console.log('  Deleting edge deployments...');
      await client.query('DELETE FROM edge_deployments');
      
      console.log('  Deleting edge activation tokens...');
      await client.query('DELETE FROM edge_activation_tokens');
      
      console.log('  Deleting edge commands...');
      await client.query('DELETE FROM edge_commands');
      
      console.log('  Deleting edge scan jobs...');
      await client.query('DELETE FROM edge_scan_jobs');
      
      console.log('  Deleting edge managed tunnels...');
      await client.query('DELETE FROM edge_managed_tunnels');

      // Delete camera related data
      console.log('  Deleting camera health history...');
      await client.query('DELETE FROM camera_health_history').catch(() => {});
      
      console.log('  Deleting camera recovery logs...');
      await client.query('DELETE FROM camera_recovery_log').catch(() => {});
      
      console.log('  Deleting camera quality alerts...');
      await client.query('DELETE FROM camera_quality_alerts').catch(() => {});
      
      console.log('  Deleting camera health checks...');
      await client.query('DELETE FROM camera_health_checks').catch(() => {});
      
      console.log('  Deleting camera quality checks...');
      await client.query('DELETE FROM camera_quality_checks').catch(() => {});
      
      console.log('  Deleting camera recording status...');
      await client.query('DELETE FROM camera_recording_status').catch(() => {});
      
      console.log('  Deleting camera specifications...');
      await client.query('DELETE FROM camera_specifications').catch(() => {});
      
      console.log('  Deleting camera installation compliance...');
      await client.query('DELETE FROM camera_installation_compliance').catch(() => {});
      
      console.log('  Deleting camera privacy controls...');
      await client.query('DELETE FROM camera_privacy_controls').catch(() => {});
      
      console.log('  Deleting camera privacy assignments...');
      await client.query('DELETE FROM camera_privacy_purpose_assignments').catch(() => {});
      
      console.log('  Deleting camera access group members...');
      await client.query('DELETE FROM camera_access_group_members').catch(() => {});
      
      console.log('  Deleting camera access requests...');
      await client.query('DELETE FROM camera_access_requests').catch(() => {});
      
      console.log('  Deleting camera specific grants...');
      await client.query('DELETE FROM camera_specific_grants').catch(() => {});
      
      console.log('  Deleting discovered devices...');
      await client.query('DELETE FROM discovered_devices').catch(() => {});

      // Delete main tables
      console.log('  Deleting all cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      
      console.log('  Deleting all edge agents...');
      const deletedEdgeAgents = await client.query('DELETE FROM edge_agents');

      console.log('\n📊 Preview results:');
      console.log(`  Would delete ${deletedEdgeAgents.rowCount} edge agents`);
      console.log(`  Would delete ${deletedCameras.rowCount} cameras`);

      await client.query('ROLLBACK');
      console.log('\n✅ Preview complete (changes rolled back)');

    } finally {
      client.release();
    }

    console.log('\n========================================');
    const confirm2 = await question('\n⚠️  Type "YES" to COMMIT the deletion: ');
    
    if (confirm2 !== 'YES') {
      console.log('✅ Operation cancelled. No data was deleted.');
      rl.close();
      await pool.end();
      process.exit(0);
    }

    // Execute with commit
    console.log('\n🔥 EXECUTING DELETION (this cannot be undone)...\n');
    
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      // Execute all deletions again
      await client2.query('DELETE FROM edge_agent_health');
      await client2.query('DELETE FROM edge_upgrade_runs');
      await client2.query('DELETE FROM edge_deployments');
      await client2.query('DELETE FROM edge_activation_tokens');
      await client2.query('DELETE FROM edge_commands');
      await client2.query('DELETE FROM edge_scan_jobs');
      await client2.query('DELETE FROM edge_managed_tunnels');
      
      await client2.query('DELETE FROM camera_health_history').catch(() => {});
      await client2.query('DELETE FROM camera_recovery_log').catch(() => {});
      await client2.query('DELETE FROM camera_quality_alerts').catch(() => {});
      await client2.query('DELETE FROM camera_health_checks').catch(() => {});
      await client2.query('DELETE FROM camera_quality_checks').catch(() => {});
      await client2.query('DELETE FROM camera_recording_status').catch(() => {});
      await client2.query('DELETE FROM camera_specifications').catch(() => {});
      await client2.query('DELETE FROM camera_installation_compliance').catch(() => {});
      await client2.query('DELETE FROM camera_privacy_controls').catch(() => {});
      await client2.query('DELETE FROM camera_privacy_purpose_assignments').catch(() => {});
      await client2.query('DELETE FROM camera_access_group_members').catch(() => {});
      await client2.query('DELETE FROM camera_access_requests').catch(() => {});
      await client2.query('DELETE FROM camera_specific_grants').catch(() => {});
      await client2.query('DELETE FROM discovered_devices').catch(() => {});
      
      await client2.query('DELETE FROM cameras');
      await client2.query('DELETE FROM edge_agents');

      await client2.query('COMMIT');
      
      console.log('\n========================================');
      console.log('✅ DELETION COMPLETE');
      console.log('========================================\n');

      // Verify deletion
      const finalEdgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
      const finalCameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
      
      console.log('📊 Final counts:');
      console.log(`  Edge Agents: ${finalEdgeCount.rows[0].count}`);
      console.log(`  Cameras: ${finalCameraCount.rows[0].count}\n`);

    } finally {
      client2.release();
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
