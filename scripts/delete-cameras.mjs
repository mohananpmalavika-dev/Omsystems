#!/usr/bin/env node

/**
 * Camera Deletion Utility
 * 
 * Safely deletes cameras and all associated data from the database.
 * 
 * Usage:
 *   node scripts/delete-cameras.mjs --all                    # Delete ALL cameras
 *   node scripts/delete-cameras.mjs --id camera-123          # Delete specific camera
 *   node scripts/delete-cameras.mjs --branch branch-001      # Delete all cameras in branch
 *   node scripts/delete-cameras.mjs --test                   # Delete cameras with 'test' in name
 *   node scripts/delete-cameras.mjs --dry-run --all          # See what would be deleted
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const { Pool } = pg;

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteAll = args.includes('--all');
const cameraId = args.find((arg, i) => args[i - 1] === '--id');
const branchId = args.find((arg, i) => args[i - 1] === '--branch');
const testOnly = args.includes('--test');
const confirm = args.includes('--confirm');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: DATABASE_URL });

// Color output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function getCamerasToDelete() {
  let query = 'SELECT id, name, branch_node_id FROM cameras WHERE 1=1';
  const params = [];
  
  if (cameraId) {
    params.push(cameraId);
    query += ` AND id = $${params.length}`;
  } else if (branchId) {
    params.push(branchId);
    query += ` AND branch_node_id = $${params.length}`;
  } else if (testOnly) {
    query += ` AND (name ILIKE '%test%' OR name ILIKE '%demo%')`;
  } else if (!deleteAll) {
    log('Error: Must specify what to delete', 'red');
    log('Usage:', 'yellow');
    log('  --all              Delete all cameras', 'yellow');
    log('  --id <camera-id>   Delete specific camera', 'yellow');
    log('  --branch <id>      Delete all cameras in branch', 'yellow');
    log('  --test             Delete test/demo cameras', 'yellow');
    log('  --dry-run          Preview without deleting', 'yellow');
    log('  --confirm          Skip confirmation prompt', 'yellow');
    process.exit(1);
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function getRelatedDataCounts(cameraIds) {
  const idList = cameraIds.map(c => c.id);
  
  const counts = {};
  
  // Count analytics data
  const analytics = await pool.query(
    'SELECT COUNT(*) FROM analytics_alerts WHERE camera_id = ANY($1)',
    [idList]
  );
  counts.analytics_alerts = parseInt(analytics.rows[0].count);
  
  // Count recording segments
  const segments = await pool.query(
    'SELECT COUNT(*) FROM recording_segments WHERE camera_id = ANY($1)',
    [idList]
  );
  counts.recording_segments = parseInt(segments.rows[0].count);
  
  // Count incidents
  const incidents = await pool.query(
    'SELECT COUNT(*) FROM incident_cameras WHERE camera_id = ANY($1)',
    [idList]
  );
  counts.incident_references = parseInt(incidents.rows[0].count);
  
  return counts;
}

async function deleteCameras(cameraIds) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const idList = cameraIds.map(c => c.id);
    
    log('\nDeleting related data...', 'blue');
    
    // Delete in correct order (respecting foreign key constraints)
    const tables = [
      'analytics_alerts',
      'analytics_events',
      'analytics_rules',
      'incident_cameras',
      'incident_video_ranges',
      'incident_clips',
      'incident_snapshots',
      'live_bookmarks',
      'live_sessions',
      'recording_segments',
      'recording_jobs',
      'recording_legal_holds',
      'camera_health_history',
      'camera_quality_metrics',
      'camera_quality_alerts',
      'camera_downtime_log',
      'camera_access_group_members',
      'camera_specific_grants',
      'camera_specifications',
      'camera_installation_compliance',
    ];
    
    for (const table of tables) {
      try {
        const result = await client.query(
          `DELETE FROM ${table} WHERE camera_id = ANY($1)`,
          [idList]
        );
        if (result.rowCount > 0) {
          log(`  ✓ Deleted ${result.rowCount} rows from ${table}`, 'green');
        }
      } catch (error) {
        // Table might not exist, continue
        if (!error.message.includes('does not exist')) {
          log(`  ⚠ Warning on ${table}: ${error.message}`, 'yellow');
        }
      }
    }
    
    // Get resource node IDs
    const nodeResult = await client.query(
      'SELECT resource_node_id FROM cameras WHERE id = ANY($1)',
      [idList]
    );
    const nodeIds = nodeResult.rows.map(r => r.resource_node_id);
    
    // Delete cameras
    log('\nDeleting cameras...', 'blue');
    const cameraResult = await client.query(
      'DELETE FROM cameras WHERE id = ANY($1)',
      [idList]
    );
    log(`  ✓ Deleted ${cameraResult.rowCount} cameras`, 'green');
    
    // Delete resource nodes
    if (nodeIds.length > 0) {
      const nodeDeleteResult = await client.query(
        "DELETE FROM resource_nodes WHERE id = ANY($1) AND type = 'camera'",
        [nodeIds]
      );
      log(`  ✓ Deleted ${nodeDeleteResult.rowCount} resource nodes`, 'green');
    }
    
    await client.query('COMMIT');
    log('\n✓ Deletion completed successfully!', 'green');
    
  } catch (error) {
    await client.query('ROLLBACK');
    log('\n✗ Error during deletion:', 'red');
    log(error.message, 'red');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    log('========================================', 'blue');
    log('  Camera Deletion Utility', 'blue');
    log('========================================', 'blue');
    
    // Get cameras to delete
    log('\nFinding cameras to delete...', 'yellow');
    const cameras = await getCamerasToDelete();
    
    if (cameras.length === 0) {
      log('No cameras found matching criteria.', 'yellow');
      process.exit(0);
    }
    
    log(`\nFound ${cameras.length} camera(s):`, 'yellow');
    cameras.forEach((cam, i) => {
      log(`  ${i + 1}. ${cam.name} (${cam.id})`, 'reset');
    });
    
    // Get related data counts
    log('\nCounting related data...', 'yellow');
    const counts = await getRelatedDataCounts(cameras);
    log(`  Analytics alerts: ${counts.analytics_alerts}`, 'reset');
    log(`  Recording segments: ${counts.recording_segments}`, 'reset');
    log(`  Incident references: ${counts.incident_references}`, 'reset');
    
    if (dryRun) {
      log('\n[DRY RUN] No changes made.', 'blue');
      process.exit(0);
    }
    
    // Confirmation
    if (!confirm) {
      log('\n⚠  WARNING: This will permanently delete these cameras and all related data!', 'red');
      log('To proceed, run again with --confirm flag', 'yellow');
      process.exit(0);
    }
    
    // Delete
    await deleteCameras(cameras);
    
  } catch (error) {
    log('\nFatal error:', 'red');
    log(error.message, 'red');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
