#!/usr/bin/env node
/**
 * DELETE ALL EDGE AGENTS AND CAMERAS (AUTO MODE)
 * NO CONFIRMATION - EXECUTES IMMEDIATELY
 */

import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function main() {
  console.log('\n========================================');
  console.log('  🔥 EXECUTING DELETION');
  console.log('========================================\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL not found in environment');
    process.exit(1);
  }

  const maskedUrl = databaseUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://***:***@');
  console.log(`📊 Database: ${maskedUrl}\n`);

  const pool = new Pool({ 
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 5
  });

  try {
    console.log('📊 Current counts:');
    
    const edgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
    const cameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
    
    console.log(`  Edge Agents: ${edgeCount.rows[0].count}`);
    console.log(`  Cameras: ${cameraCount.rows[0].count}`);

    if (edgeCount.rows[0].count === '0' && cameraCount.rows[0].count === '0') {
      console.log('\n✅ No edge agents or cameras to delete.');
      await pool.end();
      process.exit(0);
    }

    console.log('\n🔥 Starting deletion...\n');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete edge agent related data
      console.log('  ⏳ Deleting edge agent health...');
      const r1 = await client.query('DELETE FROM edge_agent_health');
      console.log(`     ✓ Deleted ${r1.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge upgrade runs...');
      const r2 = await client.query('DELETE FROM edge_upgrade_runs');
      console.log(`     ✓ Deleted ${r2.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge deployments...');
      const r3 = await client.query('DELETE FROM edge_deployments');
      console.log(`     ✓ Deleted ${r3.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge activation tokens...');
      const r4 = await client.query('DELETE FROM edge_activation_tokens');
      console.log(`     ✓ Deleted ${r4.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge commands...');
      const r5 = await client.query('DELETE FROM edge_commands');
      console.log(`     ✓ Deleted ${r5.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge scan jobs...');
      const r6 = await client.query('DELETE FROM edge_scan_jobs');
      console.log(`     ✓ Deleted ${r6.rowCount} rows`);
      
      console.log('  ⏳ Deleting edge managed tunnels...');
      const r7 = await client.query('DELETE FROM edge_managed_tunnels');
      console.log(`     ✓ Deleted ${r7.rowCount} rows`);

      // Delete camera related data
      console.log('  ⏳ Deleting camera health history...');
      const c1 = await client.query('DELETE FROM camera_health_history').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c1.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera recovery logs...');
      const c2 = await client.query('DELETE FROM camera_recovery_log').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c2.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera quality alerts...');
      const c3 = await client.query('DELETE FROM camera_quality_alerts').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c3.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera health checks...');
      const c4 = await client.query('DELETE FROM camera_health_checks').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c4.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera quality checks...');
      const c5 = await client.query('DELETE FROM camera_quality_checks').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c5.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera recording status...');
      const c6 = await client.query('DELETE FROM camera_recording_status').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c6.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera specifications...');
      const c7 = await client.query('DELETE FROM camera_specifications').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c7.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera installation compliance...');
      const c8 = await client.query('DELETE FROM camera_installation_compliance').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c8.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera privacy controls...');
      const c9 = await client.query('DELETE FROM camera_privacy_controls').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c9.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera privacy assignments...');
      const c10 = await client.query('DELETE FROM camera_privacy_purpose_assignments').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c10.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera access group members...');
      const c11 = await client.query('DELETE FROM camera_access_group_members').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c11.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera access requests...');
      const c12 = await client.query('DELETE FROM camera_access_requests').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c12.rowCount} rows`);
      
      console.log('  ⏳ Deleting camera specific grants...');
      const c13 = await client.query('DELETE FROM camera_specific_grants').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c13.rowCount} rows`);
      
      console.log('  ⏳ Deleting discovered devices...');
      const c14 = await client.query('DELETE FROM discovered_devices').catch(() => ({ rowCount: 0 }));
      console.log(`     ✓ Deleted ${c14.rowCount} rows`);

      // Delete main tables
      console.log('\n  🔥 Deleting all cameras...');
      const deletedCameras = await client.query('DELETE FROM cameras');
      console.log(`     ✓ Deleted ${deletedCameras.rowCount} cameras`);
      
      console.log('  🔥 Deleting all edge agents...');
      const deletedEdgeAgents = await client.query('DELETE FROM edge_agents');
      console.log(`     ✓ Deleted ${deletedEdgeAgents.rowCount} edge agents`);

      await client.query('COMMIT');
      
      console.log('\n========================================');
      console.log('✅ DELETION COMPLETE');
      console.log('========================================\n');

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
