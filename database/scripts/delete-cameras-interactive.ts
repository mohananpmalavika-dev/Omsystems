#!/usr/bin/env tsx
/**
 * Interactive Camera and Edge Agent Deletion Script
 * 
 * Safely deletes cameras and edge agents from the database with:
 * - Preview of what will be deleted
 * - Optional backup before deletion
 * - Tenant filtering
 * - Rollback on error
 * 
 * Usage:
 *   tsx database/scripts/delete-cameras-interactive.ts
 *   tsx database/scripts/delete-cameras-interactive.ts --tenant-id <uuid>
 *   tsx database/scripts/delete-cameras-interactive.ts --backup
 *   tsx database/scripts/delete-cameras-interactive.ts --dry-run
 */

import { Pool } from 'pg';
import * as readline from 'readline';

interface DeletionStats {
  cameras: number;
  edgeAgents: number;
  discoveries: number;
  liveSessions: number;
  incidentCameras: number;
  resourceNodes: number;
}

// Parse command line arguments
const args = process.argv.slice(2);
const tenantId = args.includes('--tenant-id') 
  ? args[args.indexOf('--tenant-id') + 1] 
  : null;
const shouldBackup = args.includes('--backup');
const dryRun = args.includes('--dry-run');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'omsystems',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

/**
 * Get counts of what will be deleted
 */
async function getPreviewCounts(client: any, tenantId: string | null): Promise<DeletionStats> {
  const tenantFilter = tenantId ? `AND rn.tenant_id = $1` : '';
  const params = tenantId ? [tenantId] : [];
  
  const camerasResult = await client.query(
    `SELECT COUNT(*) as count FROM cameras c 
     JOIN resource_nodes rn ON c.resource_node_id = rn.id 
     WHERE 1=1 ${tenantFilter}`,
    params
  );
  
  const edgeAgentsResult = await client.query(
    `SELECT COUNT(*) as count FROM edge_agents 
     WHERE 1=1 ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  const discoveriesResult = await client.query(
    `SELECT COUNT(*) as count FROM camera_discoveries 
     WHERE 1=1 ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  const liveSessionsResult = await client.query(
    `SELECT COUNT(*) as count FROM live_sessions ls 
     JOIN cameras c ON ls.camera_id = c.id 
     JOIN resource_nodes rn ON c.resource_node_id = rn.id 
     WHERE 1=1 ${tenantFilter}`,
    params
  );
  
  // Try to count incident_cameras (may not exist)
  let incidentCamerasCount = 0;
  try {
    const incidentCamerasResult = await client.query(
      `SELECT COUNT(*) as count FROM incident_cameras ic 
       JOIN cameras c ON ic.camera_id = c.id 
       JOIN resource_nodes rn ON c.resource_node_id = rn.id 
       WHERE 1=1 ${tenantFilter}`,
      params
    );
    incidentCamerasCount = parseInt(incidentCamerasResult.rows[0]?.count || '0');
  } catch (err) {
    // Table doesn't exist, that's fine
  }
  
  const resourceNodesResult = await client.query(
    `SELECT COUNT(*) as count FROM resource_nodes 
     WHERE node_type = 'camera' ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  return {
    cameras: parseInt(camerasResult.rows[0]?.count || '0'),
    edgeAgents: parseInt(edgeAgentsResult.rows[0]?.count || '0'),
    discoveries: parseInt(discoveriesResult.rows[0]?.count || '0'),
    liveSessions: parseInt(liveSessionsResult.rows[0]?.count || '0'),
    incidentCameras: incidentCamerasCount,
    resourceNodes: parseInt(resourceNodesResult.rows[0]?.count || '0')
  };
}

/**
 * Create backup of cameras and edge agents
 */
async function createBackup(client: any, tenantId: string | null): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupSuffix = tenantId ? `_tenant_${tenantId}` : '_all';
  const backupPrefix = `backup_${timestamp}${backupSuffix}`;
  
  console.log('\n📦 Creating backup tables...');
  
  const tenantFilter = tenantId ? `WHERE rn.tenant_id = '${tenantId}'` : '';
  const edgeTenantFilter = tenantId ? `WHERE tenant_id = '${tenantId}'` : '';
  
  // Backup cameras
  await client.query(`
    CREATE TABLE ${backupPrefix}_cameras AS 
    SELECT c.* FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    ${tenantFilter}
  `);
  
  // Backup edge agents
  await client.query(`
    CREATE TABLE ${backupPrefix}_edge_agents AS 
    SELECT * FROM edge_agents
    ${edgeTenantFilter}
  `);
  
  // Backup camera discoveries
  await client.query(`
    CREATE TABLE ${backupPrefix}_camera_discoveries AS 
    SELECT * FROM camera_discoveries
    ${edgeTenantFilter}
  `);
  
  // Backup resource nodes (camera type)
  await client.query(`
    CREATE TABLE ${backupPrefix}_resource_nodes AS 
    SELECT * FROM resource_nodes
    WHERE node_type = 'camera' ${tenantId ? `AND tenant_id = '${tenantId}'` : ''}
  `);
  
  console.log(`✓ Backup created with prefix: ${backupPrefix}`);
  console.log(`  To restore: Run the restore script with backup prefix`);
  
  return backupPrefix;
}

/**
 * Delete cameras and edge agents
 */
async function deleteCamerasAndEdgeAgents(client: any, tenantId: string | null): Promise<DeletionStats> {
  const tenantFilter = tenantId ? `AND rn.tenant_id = $1` : '';
  const params = tenantId ? [tenantId] : [];
  
  console.log('\n🗑️  Deleting data...');
  
  // 1. Delete live sessions
  console.log('  - Deleting live sessions...');
  const liveSessions = await client.query(
    `DELETE FROM live_sessions 
     WHERE camera_id IN (
       SELECT c.id FROM cameras c 
       JOIN resource_nodes rn ON c.resource_node_id = rn.id 
       WHERE 1=1 ${tenantFilter}
     )`,
    params
  );
  
  // 2. Delete incident_cameras (if exists)
  console.log('  - Deleting incident cameras...');
  let incidentCamerasDeleted = 0;
  try {
    const incidentCameras = await client.query(
      `DELETE FROM incident_cameras 
       WHERE camera_id IN (
         SELECT c.id FROM cameras c 
         JOIN resource_nodes rn ON c.resource_node_id = rn.id 
         WHERE 1=1 ${tenantFilter}
       )`,
      params
    );
    incidentCamerasDeleted = incidentCameras.rowCount || 0;
  } catch (err) {
    // Table doesn't exist
  }
  
  // 3. Delete camera discoveries
  console.log('  - Deleting camera discoveries...');
  const discoveries = await client.query(
    `DELETE FROM camera_discoveries 
     WHERE 1=1 ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  // 4. Delete cameras
  console.log('  - Deleting cameras...');
  const cameras = await client.query(
    `DELETE FROM cameras 
     WHERE id IN (
       SELECT c.id FROM cameras c 
       JOIN resource_nodes rn ON c.resource_node_id = rn.id 
       WHERE 1=1 ${tenantFilter}
     )`,
    params
  );
  
  // 5. Delete camera resource nodes
  console.log('  - Deleting camera resource nodes...');
  const resourceNodes = await client.query(
    `DELETE FROM resource_nodes 
     WHERE node_type = 'camera' ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  // 6. Delete edge agents
  console.log('  - Deleting edge agents...');
  const edgeAgents = await client.query(
    `DELETE FROM edge_agents 
     WHERE 1=1 ${tenantId ? 'AND tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : []
  );
  
  return {
    cameras: cameras.rowCount || 0,
    edgeAgents: edgeAgents.rowCount || 0,
    discoveries: discoveries.rowCount || 0,
    liveSessions: liveSessions.rowCount || 0,
    incidentCameras: incidentCamerasDeleted,
    resourceNodes: resourceNodes.rowCount || 0
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('============================================================');
  console.log('CAMERA AND EDGE AGENT DELETION TOOL');
  console.log('============================================================\n');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be deleted\n');
  }
  
  if (tenantId) {
    console.log(`🎯 Tenant Filter: ${tenantId}`);
  } else {
    console.log('⚠️  Scope: ALL TENANTS');
  }
  
  if (shouldBackup) {
    console.log('💾 Backup: ENABLED');
  }
  
  console.log('');
  
  const client = await pool.connect();
  
  try {
    // Get preview counts
    console.log('📊 Analyzing database...\n');
    const previewCounts = await getPreviewCounts(client, tenantId);
    
    console.log('Records to be deleted:');
    console.log(`  Cameras:           ${previewCounts.cameras}`);
    console.log(`  Edge Agents:       ${previewCounts.edgeAgents}`);
    console.log(`  Camera Discoveries: ${previewCounts.discoveries}`);
    console.log(`  Live Sessions:     ${previewCounts.liveSessions}`);
    console.log(`  Incident Cameras:  ${previewCounts.incidentCameras}`);
    console.log(`  Resource Nodes:    ${previewCounts.resourceNodes}`);
    console.log('');
    
    const totalRecords = previewCounts.cameras + 
                         previewCounts.edgeAgents + 
                         previewCounts.discoveries + 
                         previewCounts.liveSessions + 
                         previewCounts.incidentCameras + 
                         previewCounts.resourceNodes;
    
    if (totalRecords === 0) {
      console.log('✓ No records to delete.');
      return;
    }
    
    if (dryRun) {
      console.log('\n✓ Dry run complete. No data was deleted.\n');
      return;
    }
    
    // Confirm deletion
    console.log('⚠️  WARNING: This operation is IRREVERSIBLE!');
    if (!shouldBackup) {
      console.log('⚠️  No backup will be created. Data will be permanently lost!');
    }
    console.log('');
    
    const confirm = await ask('Type "DELETE" to confirm deletion: ');
    
    if (confirm.trim() !== 'DELETE') {
      console.log('\n❌ Deletion cancelled.\n');
      return;
    }
    
    // Begin transaction
    await client.query('BEGIN');
    
    try {
      // Create backup if requested
      let backupPrefix = '';
      if (shouldBackup) {
        backupPrefix = await createBackup(client, tenantId);
      }
      
      // Perform deletion
      const deletedCounts = await deleteCamerasAndEdgeAgents(client, tenantId);
      
      // Commit transaction
      await client.query('COMMIT');
      
      console.log('\n============================================================');
      console.log('✓ DELETION COMPLETE');
      console.log('============================================================');
      console.log('\nRecords deleted:');
      console.log(`  Cameras:           ${deletedCounts.cameras}`);
      console.log(`  Edge Agents:       ${deletedCounts.edgeAgents}`);
      console.log(`  Camera Discoveries: ${deletedCounts.discoveries}`);
      console.log(`  Live Sessions:     ${deletedCounts.liveSessions}`);
      console.log(`  Incident Cameras:  ${deletedCounts.incidentCameras}`);
      console.log(`  Resource Nodes:    ${deletedCounts.resourceNodes}`);
      
      if (shouldBackup) {
        console.log(`\n💾 Backup tables created: ${backupPrefix}_*`);
      }
      
      console.log('\n✓ Database updated successfully.\n');
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : String(err));
    console.error('\nTransaction rolled back. No data was deleted.\n');
    process.exit(1);
    
  } finally {
    client.release();
    rl.close();
    await pool.end();
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
