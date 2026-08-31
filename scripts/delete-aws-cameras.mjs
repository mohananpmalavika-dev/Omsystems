#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

// AWS EC2 PostgreSQL Database Configuration
const AWS_DB_CONFIG = {
  host: '3.7.216.169',
  port: 5432,
  database: 'sentinel_grid',
  user: 'sentinel_admin',
  password: process.env.AWS_DB_PASSWORD || 'sentinel_admin', // Update if different
  connectionTimeoutMillis: 30000,
};

async function deleteFromAWS() {
  const client = new Client(AWS_DB_CONFIG);

  try {
    console.log('🔌 Connecting to AWS EC2 PostgreSQL database...');
    console.log(`   Host: ${AWS_DB_CONFIG.host}`);
    console.log(`   Database: ${AWS_DB_CONFIG.database}\n`);
    
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Check current counts
    console.log('📊 Current record counts:');
    
    const tables = [
      'cameras',
      'edge_agents',
      'branches',
      'camera_health_history',
      'camera_quality_alerts',
      'camera_recording_status',
      'camera_specifications',
      'analytics_alerts',
      'camera_discoveries',
      'device_identities',
      'edge_agent_health',
      'edge_activation_tokens',
      'edge_commands',
      'edge_deployments'
    ];
    
    const counts = {};
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = result.rows[0].count;
        console.log(`  ${table}: ${counts[table]} records`);
      } catch (err) {
        console.log(`  ${table}: table not found or error`);
      }
    }
    console.log('');

    // Start transaction
    await client.query('BEGIN');
    console.log('🗑️  Starting deletion process...\n');

    // Delete in order to handle foreign key constraints
    const deletionOrder = [
      'camera_health_history',
      'camera_quality_alerts',
      'camera_recording_status',
      'camera_specifications',
      'analytics_alerts',
      'camera_discoveries',
      'device_identities',
      'edge_agent_health',
      'edge_activation_tokens',
      'edge_commands',
      'edge_deployments',
      'cameras',
      'edge_agents',
      'branches'
    ];

    let totalDeleted = 0;
    for (const table of deletionOrder) {
      try {
        const result = await client.query(`DELETE FROM ${table}`);
        if (result.rowCount > 0) {
          console.log(`  ✅ Deleted ${result.rowCount} records from ${table}`);
          totalDeleted += result.rowCount;
        }
      } catch (err) {
        console.log(`  ⚠️  ${table}: ${err.message}`);
      }
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log(`\n✅ Successfully deleted ${totalDeleted} total records!\n`);

    // Verify final counts
    console.log('📊 Final record counts:');
    for (const table of ['cameras', 'edge_agents', 'branches']) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = result.rows[0].count;
        const emoji = count === '0' ? '✅' : '⚠️';
        console.log(`  ${emoji} ${table}: ${count} records`);
      } catch (err) {
        console.log(`  ${table}: table not found`);
      }
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

console.log('🚀 AWS EC2 PostgreSQL Cleanup Script\n');
console.log('This will delete all cameras and branch gateways from your AWS database.\n');

deleteFromAWS();
