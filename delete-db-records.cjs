// Delete all cameras and gateways from production database
const { Client } = require('pg');

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function deleteCamerasAndGateways() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!\n');

    // Check current counts
    console.log('📊 Current counts:');
    const cameraCount = await client.query("SELECT COUNT(*) as count FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`Cameras: ${cameraCount.rows[0].count}\n`);

    console.log('⚠️  Starting deletion...\n');

    // Start transaction
    await client.query('BEGIN');

    // Helper function to delete with error handling
    const safeDelete = async (name, query) => {
      try {
        console.log(`${name}...`);
        const result = await client.query(query);
        console.log(`   Deleted ${result.rowCount} rows\n`);
        return result.rowCount;
      } catch (error) {
        if (error.code === '42P01') {
          console.log(`   Table does not exist, skipping\n`);
          return 0;
        }
        throw error;
      }
    };

    // Delete dependent records first
    await safeDelete('1. Deleting analytics_alerts', `
      DELETE FROM analytics_alerts 
      WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')
    `);

    await safeDelete('2. Deleting incident_cameras', `
      DELETE FROM incident_cameras 
      WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')
    `);

    await safeDelete('3. Deleting recording_segments', `
      DELETE FROM recording_segments 
      WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')
    `);

    await safeDelete('4. Deleting camera_health_snapshots', `
      DELETE FROM camera_health_snapshots 
      WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')
    `);

    await safeDelete('5. Deleting schedule_cameras', `
      DELETE FROM schedule_cameras 
      WHERE camera_id IN (SELECT id FROM resource_nodes WHERE node_type = 'camera')
    `);

    console.log('6. Deleting cameras from resource_nodes...');
    const r6 = await client.query("DELETE FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`   Deleted ${r6.rowCount} cameras\n`);

    console.log('7. Skipping gateways (no gateway node type in schema)...\n');

    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Transaction committed successfully!\n');

    // Verify deletion
    console.log('📊 Final counts:');
    const finalCameras = await client.query("SELECT COUNT(*) as count FROM resource_nodes WHERE node_type = 'camera'");
    console.log(`Remaining cameras: ${finalCameras.rows[0].count}`);

    console.log('\n✅ All cameras deleted successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error occurred, transaction rolled back:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

deleteCamerasAndGateways();
