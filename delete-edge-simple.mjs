#!/usr/bin/env node
/**
 * DELETE ALL EDGE AGENTS AND CAMERAS - SIMPLE VERSION
 * Just deletes the main tables, cascades handle related data
 */

import pg from 'pg';

const { Pool } = pg;

async function main() {
  console.log('\n🔥 DELETING ALL EDGE AGENTS AND CAMERAS...\n');

  const databaseUrl = process.argv[2] || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: Database URL required');
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

    console.log('🗑️  Deleting...\n');

    // Delete camera discoveries first (they reference edge agents)
    console.log('  ↳ Deleting camera discoveries...');
    try {
      const discResult = await pool.query('DELETE FROM camera_discoveries');
      console.log(`    ✓ Deleted ${discResult.rowCount} camera discoveries\n`);
    } catch (e) {
      console.log(`    (skipped: ${e.message.split('\n')[0]})\n`);
    }

    // Delete edge scan jobs (they reference edge agents)
    console.log('  ↳ Deleting edge scan jobs...');
    try {
      const scanResult = await pool.query('DELETE FROM edge_scan_jobs');
      console.log(`    ✓ Deleted ${scanResult.rowCount} edge scan jobs\n`);
    } catch (e) {
      console.log(`    (skipped: ${e.message.split('\n')[0]})\n`);
    }

    // Delete discovered devices
    console.log('  ↳ Deleting discovered devices...');
    try {
      const devResult = await pool.query('DELETE FROM discovered_devices');
      console.log(`    ✓ Deleted ${devResult.rowCount} discovered devices\n`);
    } catch (e) {
      console.log(`    (skipped: ${e.message.split('\n')[0]})\n`);
    }

    // Delete cameras first (if any)
    if (cameraCount.rows[0].count !== '0') {
      console.log('  ↳ Deleting all cameras (CASCADE)...');
      const result1 = await pool.query('DELETE FROM cameras');
      console.log(`    ✓ Deleted ${result1.rowCount} cameras\n`);
    }

    // Delete edge agents
    if (edgeCount.rows[0].count !== '0') {
      console.log('  ↳ Deleting all edge agents (CASCADE)...');
      const result2 = await pool.query('DELETE FROM edge_agents');
      console.log(`    ✓ Deleted ${result2.rowCount} edge agents\n`);
    }

    console.log('========================================');
    console.log('✅ DELETION COMPLETE');
    console.log('========================================\n');

    // Verify deletion
    const finalEdgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
    const finalCameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
    
    console.log('📊 Final counts:');
    console.log(`  Edge Agents: ${finalEdgeCount.rows[0].count}`);
    console.log(`  Cameras: ${finalCameraCount.rows[0].count}\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
