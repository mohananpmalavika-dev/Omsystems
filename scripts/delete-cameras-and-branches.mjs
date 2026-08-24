#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

async function deleteCamerasAndBranches() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Start transaction
    await client.query('BEGIN');

    // First, let's check what tables exist
    console.log('📋 Checking database tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('Available tables:');
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    console.log('');

    // Check current counts
    const possibleTables = ['cameras', 'edge_agents', 'edge_gateways', 'branches'];
    const existingTables = [];
    
    console.log('📊 Current record counts:');
    
    for (const table of possibleTables) {
      const checkTable = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${table}'
        );
      `);
      
      if (checkTable.rows[0].exists) {
        existingTables.push(table);
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${countResult.rows[0].count} records`);
      } else {
        console.log(`  ${table}: not found`);
      }
    }
    console.log('');

    // Delete in the correct order to handle foreign key constraints
    
    // First, delete related records that reference cameras and edge_agents
    console.log('🗑️  Deleting related records...');
    
    const relatedTables = [
      'edge_scan_jobs',
      'camera_health',
      'camera_health_checks',
      'camera_health_daily',
      'camera_credentials',
      'camera_discoveries',
      'camera_access_requests',
      'camera_specific_grants',
      'camera_quality_checks',
      'camera_ownership_leases',
      'camera_privacy_controls',
      'camera_privacy_purpose_assignments',
      'camera_installation_compliance',
      'camera_specifications',
      'camera_sequences',
      'camera_access_group_members',
      'live_sessions',
      'recording_segments',
      'recording_jobs',
      'recording_events',
      'analytics_rules',
      'analytics_events',
      'analytics_zones',
      'edge_commands',
      'edge_agent_health',
      'edge_deployments',
      'edge_managed_tunnels',
      'edge_activation_tokens',
      'incident_cameras'
    ];
    
    let totalDeleted = 0;
    for (const table of relatedTables) {
      const checkTable = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${table}'
        );
      `);
      
      if (checkTable.rows[0].exists) {
        try {
          const result = await client.query(`DELETE FROM ${table}`);
          if (result.rowCount > 0) {
            console.log(`  - ${table}: deleted ${result.rowCount} records`);
            totalDeleted += result.rowCount;
          }
        } catch (err) {
          console.log(`  - ${table}: ${err.message}`);
        }
      }
    }
    console.log(`✅ Deleted ${totalDeleted} related records\n`);

    // Delete cameras
    if (existingTables.includes('cameras')) {
      console.log('🗑️  Deleting cameras...');
      const cameraResult = await client.query('DELETE FROM cameras RETURNING id');
      console.log(`✅ Deleted ${cameraResult.rowCount} cameras`);
    }

    // Delete edge agents (this is likely the correct table name)
    if (existingTables.includes('edge_agents')) {
      console.log('🗑️  Deleting edge agents...');
      const agentResult = await client.query('DELETE FROM edge_agents RETURNING id');
      console.log(`✅ Deleted ${agentResult.rowCount} edge agents`);
    }

    // Delete edge gateways (if it exists)
    if (existingTables.includes('edge_gateways')) {
      console.log('🗑️  Deleting edge gateways...');
      const gatewayResult = await client.query('DELETE FROM edge_gateways RETURNING id');
      console.log(`✅ Deleted ${gatewayResult.rowCount} edge gateways`);
    }

    // Delete branches (if you want to delete them too)
    if (existingTables.includes('branches')) {
      console.log('🗑️  Deleting branches...');
      const branchResult = await client.query('DELETE FROM branches RETURNING id');
      console.log(`✅ Deleted ${branchResult.rowCount} branches`);
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ All deletions committed successfully!');

    // Verify counts after deletion
    console.log('\n📊 Final record counts:');
    for (const table of existingTables) {
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  ${table}: ${countResult.rows[0].count} records`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

deleteCamerasAndBranches();
