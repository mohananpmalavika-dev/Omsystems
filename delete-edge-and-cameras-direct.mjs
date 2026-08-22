#!/usr/bin/env node
/**
 * DELETE ALL EDGE AGENTS AND CAMERAS - DIRECT EXECUTION
 * NO CONFIRMATIONS - RUNS IMMEDIATELY
 */

import pg from 'pg';

const { Pool } = pg;

async function main() {
  console.log('\n🔥 EXECUTING DELETION OF ALL EDGE AGENTS AND CAMERAS...\n');

  const databaseUrl = process.argv[2] || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: Database URL required as argument or DATABASE_URL env var');
    process.exit(1);
  }

  const maskedUrl = databaseUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://***:***@');
  console.log(`📊 Database: ${maskedUrl}\n`);

  const pool = new Pool({ 
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📊 Current counts:');
    
    const edgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
    const cameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
    
    console.log(`  Edge Agents: ${edgeCount.rows[0].count}`);
    console.log(`  Cameras: ${cameraCount.rows[0].count}\n`);

    if (edgeCount.rows[0].count === '0' && cameraCount.rows[0].count === '0') {
      console.log('✅ No edge agents or cameras to delete.');
      await pool.end();
      process.exit(0);
    }

    console.log('🗑️  Starting deletion...\n');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete edge agent related data
      console.log('  ↳ Deleting edge agent health...');
      await client.query('DELETE FROM edge_agent_health').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge upgrade runs...');
      await client.query('DELETE FROM edge_upgrade_runs').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge deployments...');
      await client.query('DELETE FROM edge_deployments').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge activation tokens...');
      await client.query('DELETE FROM edge_activation_tokens').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge commands...');
      await client.query('DELETE FROM edge_commands').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge scan jobs...');
      await client.query('DELETE FROM edge_scan_jobs').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting edge managed tunnels...');
      await client.query('DELETE FROM edge_managed_tunnels').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));

      // Delete camera related data
      console.log('  ↳ Deleting camera health history...');
      await client.query('DELETE FROM camera_health_history').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera recovery logs...');
      await client.query('DELETE FROM camera_recovery_log').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera quality alerts...');
      await client.query('DELETE FROM camera_quality_alerts').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera health checks...');
      await client.query('DELETE FROM camera_health_checks').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera quality checks...');
      await client.query('DELETE FROM camera_quality_checks').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera recording status...');
      await client.query('DELETE FROM camera_recording_status').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera specifications...');
      await client.query('DELETE FROM camera_specifications').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera installation compliance...');
      await client.query('DELETE FROM camera_installation_compliance').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera privacy controls...');
      await client.query('DELETE FROM camera_privacy_controls').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera privacy assignments...');
      await client.query('DELETE FROM camera_privacy_purpose_assignments').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera access group members...');
      await client.query('DELETE FROM camera_access_group_members').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera access requests...');
      await client.query('DELETE FROM camera_access_requests').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting camera specific grants...');
      await client.query('DELETE FROM camera_specific_grants').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting analytics acknowledgements...');
      await client.query('DELETE FROM analytics_acknowledgements').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));
      
      console.log('  ↳ Deleting discovered devices...');
      await client.query('DELETE FROM discovered_devices').catch(e => console.log(`    (skipped: ${e.message.split('\n')[0]})`));

      // Delete main tables
      console.log('  ↳ Deleting all cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      
      console.log('  ↳ Deleting all edge agents...');
      const deletedEdgeAgents = await client.query('DELETE FROM edge_agents');

      await client.query('COMMIT');
      
      console.log('\n========================================');
      console.log('✅ DELETION COMPLETE');
      console.log('========================================\n');
      console.log(`  Deleted ${deletedEdgeAgents.rowCount} edge agents`);
      console.log(`  Deleted ${deletedCameras.rowCount} cameras\n`);

      // Verify deletion
      const finalEdgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
      const finalCameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
      
      console.log('📊 Final counts:');
      console.log(`  Edge Agents: ${finalEdgeCount.rows[0].count}`);
      console.log(`  Cameras: ${finalCameraCount.rows[0].count}\n`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
