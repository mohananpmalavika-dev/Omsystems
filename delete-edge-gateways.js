import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function deleteEdgeGatewaysAndCameras() {
  const client = new Client({ 
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Check current counts
    console.log('\n📊 Checking enum values...');
    const enumValues = await client.query("SELECT unnest(enum_range(NULL::resource_node_type))::text as type");
    console.log('Valid node types:', enumValues.rows.map(r => r.type).join(', '));
    
    // Check for edge gateway tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%gateway%'
      OR table_name LIKE '%edge%'
    `);
    console.log('\nGateway/Edge related tables:', tables.rows.map(r => r.table_name).join(', '));
    
    console.log('\n📊 Current counts:');
    const cameraCount = await client.query("SELECT COUNT(*) as count FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`Cameras: ${cameraCount.rows[0].count}`);
    
    // Check for edge gateways in a separate table
    try {
      const edgeGateways = await client.query("SELECT COUNT(*) as count FROM edge_gateways");
      console.log(`Edge Gateways: ${edgeGateways.rows[0].count}`);
    } catch (e) {
      console.log('No edge_gateways table found');
    }
    
    // Delete dependent records first
    console.log('\n🗑️  Deleting dependent records...');
    
    // Delete analytics alerts
    const alerts = await client.query("DELETE FROM analytics_alerts WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
    console.log(`  Deleted ${alerts.rowCount} analytics alerts`);
    
    // Delete incident cameras
    const incidentCameras = await client.query("DELETE FROM incident_cameras WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
    console.log(`  Deleted ${incidentCameras.rowCount} incident camera associations`);
    
    // Delete recording segments
    const recordings = await client.query("DELETE FROM recording_segments WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
    console.log(`  Deleted ${recordings.rowCount} recording segments`);
    
    // Delete camera health snapshots
    const healthSnapshots = await client.query("DELETE FROM camera_health_snapshots WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
    console.log(`  Deleted ${healthSnapshots.rowCount} health snapshots`);
    
    // Delete schedule cameras
    const scheduleCameras = await client.query("DELETE FROM schedule_cameras WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')");
    console.log(`  Deleted ${scheduleCameras.rowCount} schedule camera associations`);
    
    // Delete cameras
    console.log('\n🗑️  Deleting cameras...');
    const deletedCameras = await client.query("DELETE FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`  Deleted ${deletedCameras.rowCount} cameras`);
    
    // Delete edge gateways if table exists
    console.log('\n🗑️  Deleting edge gateways...');
    try {
      const deletedGateways = await client.query("DELETE FROM edge_gateways");
      console.log(`  Deleted ${deletedGateways.rowCount} edge gateways`);
    } catch (e) {
      console.log('  No edge_gateways table to delete from');
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully');
    
    // Verify deletion
    console.log('\n📊 Final counts:');
    const finalCameraCount = await client.query("SELECT COUNT(*) as count FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`Cameras: ${finalCameraCount.rows[0].count}`);
    
    try {
      const finalGatewayCount = await client.query("SELECT COUNT(*) as count FROM edge_gateways");
      console.log(`Edge Gateways: ${finalGatewayCount.rows[0].count}`);
    } catch (e) {
      console.log('Edge Gateways: table not found');
    }
    
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('⚠️  Rollback error:', rollbackError.message);
    }
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    try {
      await client.end();
      console.log('\n🔌 Database connection closed');
    } catch (endError) {
      console.error('⚠️  Error closing connection:', endError.message);
    }
  }
}

deleteEdgeGatewaysAndCameras()
  .then(() => {
    console.log('\n✅ All edge gateways and cameras deleted successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to delete:', error);
    process.exit(1);
  });
