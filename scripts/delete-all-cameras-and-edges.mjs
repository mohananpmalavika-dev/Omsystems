/**
 * Delete All Cameras and Branch Edges Script (ES Module)
 * 
 * This script removes all cameras and edge agents (branch edges) from the database.
 * 
 * Usage:
 *   node scripts/delete-all-cameras-and-edges.mjs
 * 
 * WARNING: This operation cannot be undone!
 */

import pg from "pg";
import readline from "readline";

const { Pool } = pg;

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL or DIRECT_URL environment variable is required");
  process.exit(1);
}

// Create database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' || process.env.DATABASE_SSL === 'require' || DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false } 
    : false,
});

/**
 * Prompt user for confirmation
 */
async function confirmDeletion() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE ALL cameras and edge agents from the database!\n' +
      'This action CANNOT be undone!\n\n' +
      'Type "DELETE ALL" to confirm: ',
      (answer) => {
        rl.close();
        resolve(answer.trim() === "DELETE ALL");
      }
    );
  });
}

/**
 * Get current counts before deletion
 */
async function getCurrentCounts() {
  const client = await pool.connect();
  try {
    const counts = {};

    const queries = [
      { key: 'cameras', query: 'SELECT COUNT(*)::int as count FROM cameras' },
      { key: 'edgeAgents', query: 'SELECT COUNT(*)::int as count FROM edge_agents' },
      { key: 'cameraDiscoveries', query: 'SELECT COUNT(*)::int as count FROM camera_discoveries' },
      { key: 'deviceIdentities', query: 'SELECT COUNT(*)::int as count FROM device_identities WHERE camera_id IS NOT NULL' },
      { key: 'recordingJobs', query: 'SELECT COUNT(*)::int as count FROM recording_jobs' },
      { key: 'liveSessions', query: 'SELECT COUNT(*)::int as count FROM live_sessions' },
      { key: 'analyticsAlerts', query: 'SELECT COUNT(*)::int as count FROM analytics_alerts WHERE camera_id IS NOT NULL' },
      { key: 'recordingSegments', query: 'SELECT COUNT(*)::int as count FROM recording_segments WHERE camera_id IS NOT NULL' },
      { key: 'incidentCameras', query: 'SELECT COUNT(*)::int as count FROM incident_cameras' },
      { key: 'cameraAccessRequests', query: 'SELECT COUNT(*)::int as count FROM camera_access_requests' },
      { key: 'cameraSpecifications', query: 'SELECT COUNT(*)::int as count FROM camera_specifications' },
      { key: 'edgeActivationTokens', query: 'SELECT COUNT(*)::int as count FROM edge_activation_tokens' },
      { key: 'edgeScanJobs', query: 'SELECT COUNT(*)::int as count FROM edge_scan_jobs' },
      { key: 'edgeCommands', query: 'SELECT COUNT(*)::int as count FROM edge_commands' },
      { key: 'edgeManagedTunnels', query: 'SELECT COUNT(*)::int as count FROM edge_managed_tunnels' },
    ];

    for (const { key, query } of queries) {
      try {
        const result = await client.query(query);
        counts[key] = result.rows[0]?.count || 0;
      } catch (error) {
        console.warn(`⚠️  Could not get count for ${key}:`, error.message);
        counts[key] = 0;
      }
    }

    return counts;
  } finally {
    client.release();
  }
}

/**
 * Delete all cameras and related data
 */
async function deleteAllCamerasAndEdges() {
  const client = await pool.connect();
  const stats = {
    cameras: 0,
    cameraNodes: 0,
    edgeAgents: 0,
    cameraDiscoveries: 0,
    deviceIdentities: 0,
    recordingJobs: 0,
    liveSessions: 0,
    analyticsAlerts: 0,
    recordingSegments: 0,
    incidentCameras: 0,
    cameraAccessRequests: 0,
    cameraSpecifications: 0,
    edgeActivationTokens: 0,
    edgeScanJobs: 0,
    edgeCommands: 0,
    edgeManagedTunnels: 0,
  };

  try {
    await client.query("BEGIN");
    console.log("\n🔄 Starting deletion process...\n");

    // 1. Delete camera-related data first (foreign key dependencies)
    console.log("📌 Step 1: Deleting camera access requests...");
    const accessRequests = await client.query("DELETE FROM camera_access_requests RETURNING id");
    stats.cameraAccessRequests = accessRequests.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.cameraAccessRequests} camera access requests`);

    console.log("📌 Step 2: Deleting camera specifications...");
    const specs = await client.query("DELETE FROM camera_specifications RETURNING id");
    stats.cameraSpecifications = specs.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.cameraSpecifications} camera specifications`);

    console.log("📌 Step 3: Deleting incident cameras...");
    const incidentCameras = await client.query("DELETE FROM incident_cameras RETURNING id");
    stats.incidentCameras = incidentCameras.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.incidentCameras} incident camera links`);

    console.log("📌 Step 4: Deleting recording segments...");
    const segments = await client.query("DELETE FROM recording_segments WHERE camera_id IS NOT NULL RETURNING id");
    stats.recordingSegments = segments.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.recordingSegments} recording segments`);

    console.log("📌 Step 5: Deleting analytics alerts...");
    const alerts = await client.query("DELETE FROM analytics_alerts WHERE camera_id IS NOT NULL RETURNING id");
    stats.analyticsAlerts = alerts.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.analyticsAlerts} analytics alerts`);

    console.log("📌 Step 6: Deleting live sessions...");
    const sessions = await client.query("DELETE FROM live_sessions RETURNING id");
    stats.liveSessions = sessions.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.liveSessions} live sessions`);

    console.log("📌 Step 7: Deleting recording jobs...");
    const jobs = await client.query("DELETE FROM recording_jobs RETURNING id");
    stats.recordingJobs = jobs.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.recordingJobs} recording jobs`);

    console.log("📌 Step 8: Deleting camera discoveries...");
    const discoveries = await client.query("DELETE FROM camera_discoveries RETURNING id");
    stats.cameraDiscoveries = discoveries.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.cameraDiscoveries} camera discoveries`);

    console.log("📌 Step 9: Deleting cameras...");
    const cameras = await client.query("DELETE FROM cameras RETURNING id, resource_node_id");
    stats.cameras = cameras.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.cameras} cameras`);

    // Delete camera resource nodes
    if (cameras.rows.length > 0) {
      console.log("📌 Step 10: Deleting camera resource nodes...");
      const nodeIds = cameras.rows.map(row => row.resource_node_id).filter(Boolean);
      if (nodeIds.length > 0) {
        const nodes = await client.query(
          "DELETE FROM resource_nodes WHERE id = ANY($1::uuid[]) AND node_type = 'camera' RETURNING id",
          [nodeIds]
        );
        stats.cameraNodes = nodes.rowCount || 0;
        console.log(`   ✅ Deleted ${stats.cameraNodes} camera resource nodes`);
      }
    }

    console.log("📌 Step 11: Unlinking device identities...");
    const identities = await client.query(
      "UPDATE device_identities SET camera_id = NULL WHERE camera_id IS NOT NULL RETURNING id"
    );
    stats.deviceIdentities = identities.rowCount || 0;
    console.log(`   ✅ Unlinked ${stats.deviceIdentities} device identities`);

    // 2. Delete edge agent-related data
    console.log("📌 Step 12: Deleting edge commands...");
    const commands = await client.query("DELETE FROM edge_commands RETURNING id");
    stats.edgeCommands = commands.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.edgeCommands} edge commands`);

    console.log("📌 Step 13: Deleting edge scan jobs...");
    const scanJobs = await client.query("DELETE FROM edge_scan_jobs RETURNING id");
    stats.edgeScanJobs = scanJobs.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.edgeScanJobs} edge scan jobs`);

    console.log("📌 Step 14: Deleting edge managed tunnels...");
    const tunnels = await client.query("DELETE FROM edge_managed_tunnels RETURNING branch_node_id");
    stats.edgeManagedTunnels = tunnels.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.edgeManagedTunnels} edge managed tunnels`);

    console.log("📌 Step 15: Deleting edge activation tokens...");
    const tokens = await client.query("DELETE FROM edge_activation_tokens RETURNING id");
    stats.edgeActivationTokens = tokens.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.edgeActivationTokens} edge activation tokens`);

    console.log("📌 Step 16: Deleting edge agents (branch edges)...");
    const agents = await client.query("DELETE FROM edge_agents RETURNING id");
    stats.edgeAgents = agents.rowCount || 0;
    console.log(`   ✅ Deleted ${stats.edgeAgents} edge agents`);

    await client.query("COMMIT");
    console.log("\n✅ Transaction committed successfully!\n");

    return stats;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Transaction rolled back due to error");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("=".repeat(70));
  console.log("  DELETE ALL CAMERAS AND BRANCH EDGES");
  console.log("=".repeat(70));

  try {
    // Get current counts
    console.log("\n📊 Current database state:");
    const currentCounts = await getCurrentCounts();
    
    console.log(`   Cameras: ${currentCounts.cameras || 0}`);
    console.log(`   Edge Agents (Branch Edges): ${currentCounts.edgeAgents || 0}`);
    console.log(`   Camera Discoveries: ${currentCounts.cameraDiscoveries || 0}`);
    console.log(`   Recording Jobs: ${currentCounts.recordingJobs || 0}`);
    console.log(`   Live Sessions: ${currentCounts.liveSessions || 0}`);
    console.log(`   Analytics Alerts: ${currentCounts.analyticsAlerts || 0}`);
    console.log(`   Recording Segments: ${currentCounts.recordingSegments || 0}`);
    console.log(`   Camera Access Requests: ${currentCounts.cameraAccessRequests || 0}`);
    console.log(`   Edge Commands: ${currentCounts.edgeCommands || 0}`);
    console.log(`   Edge Scan Jobs: ${currentCounts.edgeScanJobs || 0}`);

    // Confirm deletion
    const confirmed = await confirmDeletion();
    
    if (!confirmed) {
      console.log("\n❌ Deletion cancelled by user");
      process.exit(0);
    }

    // Perform deletion
    const stats = await deleteAllCamerasAndEdges();

    // Display results
    console.log("=".repeat(70));
    console.log("  DELETION SUMMARY");
    console.log("=".repeat(70));
    console.log(`✅ Cameras deleted:                    ${stats.cameras}`);
    console.log(`✅ Camera resource nodes deleted:      ${stats.cameraNodes}`);
    console.log(`✅ Edge agents deleted:                ${stats.edgeAgents}`);
    console.log(`✅ Camera discoveries deleted:         ${stats.cameraDiscoveries}`);
    console.log(`✅ Device identities unlinked:         ${stats.deviceIdentities}`);
    console.log(`✅ Recording jobs deleted:             ${stats.recordingJobs}`);
    console.log(`✅ Live sessions deleted:              ${stats.liveSessions}`);
    console.log(`✅ Analytics alerts deleted:           ${stats.analyticsAlerts}`);
    console.log(`✅ Recording segments deleted:         ${stats.recordingSegments}`);
    console.log(`✅ Incident cameras deleted:           ${stats.incidentCameras}`);
    console.log(`✅ Camera access requests deleted:     ${stats.cameraAccessRequests}`);
    console.log(`✅ Camera specifications deleted:      ${stats.cameraSpecifications}`);
    console.log(`✅ Edge activation tokens deleted:     ${stats.edgeActivationTokens}`);
    console.log(`✅ Edge scan jobs deleted:             ${stats.edgeScanJobs}`);
    console.log(`✅ Edge commands deleted:              ${stats.edgeCommands}`);
    console.log(`✅ Edge managed tunnels deleted:       ${stats.edgeManagedTunnels}`);
    console.log("=".repeat(70));
    console.log("\n🎉 All cameras and branch edges have been successfully deleted!");

  } catch (error) {
    console.error("\n❌ Error during deletion:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
