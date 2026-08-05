import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function deleteAll() {
  const client = new Client({ 
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Check current counts (no transaction yet)
    console.log('📊 Current counts:');
    const cameras = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'camera'");
    const agents = await client.query("SELECT COUNT(*) FROM edge_agents");
    console.log(`  Cameras: ${cameras.rows[0].count}`);
    console.log(`  Edge Agents: ${agents.rows[0].count}\n`);
    
    // Delete in order
    console.log('🗑️  Deleting...');
    
    // 1. Analytics alerts
    try {
      const r1 = await client.query("DELETE FROM analytics_alerts WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r1.rowCount || 0} analytics alerts`);
    } catch (e) { console.log(`  ⚠️ analytics_alerts: ${e.message}`); }
    
    // 2. Incident cameras
    try {
      const r2 = await client.query("DELETE FROM incident_cameras WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r2.rowCount || 0} incident cameras`);
    } catch (e) { console.log(`  ⚠️ incident_cameras: ${e.message}`); }
    
    // 3. Recording segments
    try {
      const r3 = await client.query("DELETE FROM recording_segments WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r3.rowCount || 0} recording segments`);
    } catch (e) { console.log(`  ⚠️ recording_segments: ${e.message}`); }
    
    // 4. Camera health snapshots
    try {
      const r4 = await client.query("DELETE FROM camera_health_snapshots WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r4.rowCount || 0} health snapshots`);
    } catch (e) { console.log(`  ⚠️ camera_health_snapshots: ${e.message}`); }
    
    // 5. Schedule cameras
    try {
      const r5 = await client.query("DELETE FROM schedule_cameras WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r5.rowCount || 0} schedule cameras`);
    } catch (e) { console.log(`  ⚠️ schedule_cameras: ${e.message}`); }
    
    // 6. Edge commands (for agents)
    try {
      const r6 = await client.query("DELETE FROM edge_commands");
      console.log(`  ✓ Deleted ${r6.rowCount || 0} edge commands`);
    } catch (e) { console.log(`  ⚠️ edge_commands: ${e.message}`); }
    
    // 7. Edge managed tunnels
    try {
      const r7 = await client.query("DELETE FROM edge_managed_tunnels");
      console.log(`  ✓ Deleted ${r7.rowCount || 0} edge tunnels`);
    } catch (e) { console.log(`  ⚠️ edge_managed_tunnels: ${e.message}`); }
    
    // 8. Edge scan jobs
    try {
      const r8 = await client.query("DELETE FROM edge_scan_jobs");
      console.log(`  ✓ Deleted ${r8.rowCount || 0} scan jobs`);
    } catch (e) { console.log(`  ⚠️ edge_scan_jobs: ${e.message}`); }
    
    // 9. Edge activation tokens
    try {
      const r9 = await client.query("DELETE FROM edge_activation_tokens");
      console.log(`  ✓ Deleted ${r9.rowCount || 0} activation tokens`);
    } catch (e) { console.log(`  ⚠️ edge_activation_tokens: ${e.message}`); }
    
    // 10. Drop foreign key constraint temporarily
    try {
      await client.query("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_resource_node_id_fkey");
      await client.query("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_edge_agent_id_fkey");
      console.log(`  ✓ Dropped foreign key constraints`);
    } catch (e) { console.log(`  ⚠️ drop constraints: ${e.message}`); }
    
    // 10b. Delete live_sessions (references cameras)
    try {
      const r10b = await client.query("DELETE FROM live_sessions");
      console.log(`  ✓ Deleted ${r10b.rowCount || 0} live sessions`);
    } catch (e) { console.log(`  ⚠️ live_sessions: ${e.message}`); }
    
    // 10c. Delete from cameras table (references resource_nodes)
    try {
      const r10c = await client.query("DELETE FROM cameras WHERE resource_node_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
      console.log(`  ✓ Deleted ${r10c.rowCount || 0} entries from cameras table`);
    } catch (e) { console.log(`  ⚠️ cameras table: ${e.message}`); }
    
    // 11. Cameras
    const deletedCameras = await client.query("DELETE FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`  ✓ Deleted ${deletedCameras.rowCount} cameras`);
    
    // 12. Edge agents from resource_nodes (if any)
    try {
      const r12 = await client.query("DELETE FROM resource_nodes WHERE node_type = 'edge-agent'");
      console.log(`  ✓ Deleted ${r12.rowCount || 0} edge agents from resource_nodes`);
    } catch (e) { console.log(`  ⚠️ edge agents from resource_nodes: ${e.message}`); }
    
    // 13. Camera discoveries (references edge_agents)
    try {
      const r13 = await client.query("DELETE FROM camera_discoveries");
      console.log(`  ✓ Deleted ${r13.rowCount || 0} camera discoveries`);
    } catch (e) { console.log(`  ⚠️ camera_discoveries: ${e.message}`); }
    
    // 14. Edge agents
    const deletedAgents = await client.query("DELETE FROM edge_agents");
    console.log(`  ✓ Deleted ${deletedAgents.rowCount} edge agents\n`);
    
    // 14. Recreate foreign key constraints
    try {
      await client.query(`
        ALTER TABLE audit_events 
        ADD CONSTRAINT audit_events_resource_node_id_fkey 
        FOREIGN KEY (resource_node_id) REFERENCES resource_nodes(id) ON DELETE SET NULL
      `);
      await client.query(`
        ALTER TABLE audit_events 
        ADD CONSTRAINT audit_events_edge_agent_id_fkey 
        FOREIGN KEY (edge_agent_id) REFERENCES edge_agents(id) ON DELETE SET NULL
      `);
      console.log(`  ✓ Recreated foreign key constraints\n`);
    } catch (e) { console.log(`  ⚠️ recreate constraints: ${e.message}\n`); }
    
    console.log('✅ All deletions completed!\n');
    
    // Final verification
    console.log('📊 Final counts:');
    const finalCameras = await client.query("SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'camera'");
    const finalAgents = await client.query("SELECT COUNT(*) FROM edge_agents");
    console.log(`  Cameras: ${finalCameras.rows[0].count}`);
    console.log(`  Edge Agents: ${finalAgents.rows[0].count}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

deleteAll()
  .then(() => {
    console.log('\n✅ All cameras and edge agents deleted successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
