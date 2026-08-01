#!/usr/bin/env node

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const action = process.argv[2];
const id = process.argv[3];

async function deleteGateway(gatewayId) {
  const gateway = await client.query('SELECT name FROM edge_agents WHERE id = $1', [gatewayId]);
  if (gateway.rows.length === 0) {
    console.log('❌ Gateway not found.');
    return;
  }
  
  console.log(`\n🗑️  Deleting gateway: ${gateway.rows[0].name}`);
  
  const cameras = await client.query('DELETE FROM cameras WHERE edge_agent_id = $1', [gatewayId]);
  console.log(`   ✓ Deleted ${cameras.rowCount} cameras`);
  
  const telemetry = await client.query('DELETE FROM edge_agent_telemetry WHERE edge_agent_id = $1', [gatewayId]);
  console.log(`   ✓ Deleted ${telemetry.rowCount} telemetry records`);
  
  const discoveries = await client.query('DELETE FROM camera_discovery_records WHERE edge_agent_id = $1', [gatewayId]);
  console.log(`   ✓ Deleted ${discoveries.rowCount} discovery records`);
  
  const scans = await client.query('DELETE FROM camera_scan_jobs WHERE edge_agent_id = $1', [gatewayId]);
  console.log(`   ✓ Deleted ${scans.rowCount} scan jobs`);
  
  const liveSessions = await client.query('DELETE FROM live_sessions WHERE edge_agent_id = $1', [gatewayId]);
  console.log(`   ✓ Deleted ${liveSessions.rowCount} live sessions`);
  
  await client.query('DELETE FROM edge_agents WHERE id = $1', [gatewayId]);
  console.log(`   ✓ Gateway deleted\n`);
  console.log('✅ Done!');
}

async function deleteCamera(cameraId) {
  const camera = await client.query('SELECT model, ip_address FROM cameras WHERE id = $1', [cameraId]);
  if (camera.rows.length === 0) {
    console.log('❌ Camera not found.');
    return;
  }
  
  console.log(`\n🗑️  Deleting camera: ${camera.rows[0].model} (${camera.rows[0].ip_address})`);
  
  const liveSessions = await client.query('DELETE FROM live_sessions WHERE camera_id = $1', [cameraId]);
  console.log(`   ✓ Deleted ${liveSessions.rowCount} live sessions`);
  
  const discoveries = await client.query('DELETE FROM camera_discovery_records WHERE camera_id = $1', [cameraId]);
  console.log(`   ✓ Deleted ${discoveries.rowCount} discovery records`);
  
  await client.query('DELETE FROM cameras WHERE id = $1', [cameraId]);
  console.log(`   ✓ Camera deleted\n`);
  console.log('✅ Done!');
}

async function deleteBranch(branchId) {
  const branch = await client.query('SELECT name FROM branches WHERE id = $1', [branchId]);
  if (branch.rows.length === 0) {
    console.log('❌ Branch not found.');
    return;
  }
  
  console.log(`\n🗑️  Deleting branch: ${branch.rows[0].name}`);
  
  const gateways = await client.query('SELECT id FROM edge_agents WHERE branch_id = $1', [branchId]);
  console.log(`   Found ${gateways.rows.length} gateways`);
  
  for (const gateway of gateways.rows) {
    await client.query('DELETE FROM cameras WHERE edge_agent_id = $1', [gateway.id]);
    await client.query('DELETE FROM edge_agent_telemetry WHERE edge_agent_id = $1', [gateway.id]);
    await client.query('DELETE FROM camera_discovery_records WHERE edge_agent_id = $1', [gateway.id]);
    await client.query('DELETE FROM camera_scan_jobs WHERE edge_agent_id = $1', [gateway.id]);
    await client.query('DELETE FROM live_sessions WHERE edge_agent_id = $1', [gateway.id]);
    await client.query('DELETE FROM edge_agents WHERE id = $1', [gateway.id]);
  }
  
  await client.query('DELETE FROM branches WHERE id = $1', [branchId]);
  console.log(`   ✓ Branch and all gateways deleted\n`);
  console.log('✅ Done!');
}

async function deleteAll(type) {
  console.log(`\n⚠️  Deleting all ${type}...`);
  
  if (type === 'gateways') {
    await client.query('DELETE FROM cameras');
    await client.query('DELETE FROM edge_agent_telemetry');
    await client.query('DELETE FROM camera_discovery_records');
    await client.query('DELETE FROM camera_scan_jobs');
    await client.query('DELETE FROM live_sessions');
    const result = await client.query('DELETE FROM edge_agents');
    console.log(`✅ Deleted ${result.rowCount} gateways and all related data.`);
  } else if (type === 'cameras') {
    await client.query('DELETE FROM live_sessions WHERE camera_id IS NOT NULL');
    await client.query('DELETE FROM camera_discovery_records WHERE camera_id IS NOT NULL');
    const result = await client.query('DELETE FROM cameras');
    console.log(`✅ Deleted ${result.rowCount} cameras.`);
  } else if (type === 'branches') {
    await client.query('DELETE FROM cameras');
    await client.query('DELETE FROM edge_agent_telemetry');
    await client.query('DELETE FROM camera_discovery_records');
    await client.query('DELETE FROM camera_scan_jobs');
    await client.query('DELETE FROM live_sessions');
    await client.query('DELETE FROM edge_agents');
    const result = await client.query('DELETE FROM branches');
    console.log(`✅ Deleted ${result.rowCount} branches and all related data.`);
  }
}

async function listAll(type) {
  if (type === 'gateways') {
    const result = await client.query(`
      SELECT id, name, status, last_seen_at 
      FROM edge_agents 
      ORDER BY created_at DESC
    `);
    console.log('\n📡 GATEWAYS:');
    result.rows.forEach(g => {
      console.log(`   ${g.id} | ${g.name} | ${g.status} | Last: ${g.last_seen_at || 'Never'}`);
    });
  } else if (type === 'cameras') {
    const result = await client.query(`
      SELECT c.id, c.model, c.ip_address, c.status, e.name as gateway
      FROM cameras c
      LEFT JOIN edge_agents e ON c.edge_agent_id = e.id
      ORDER BY c.created_at DESC
    `);
    console.log('\n📹 CAMERAS:');
    result.rows.forEach(c => {
      console.log(`   ${c.id} | ${c.model} | ${c.ip_address} | Gateway: ${c.gateway || 'None'}`);
    });
  } else if (type === 'branches') {
    const result = await client.query(`
      SELECT b.id, b.name, b.address,
             (SELECT COUNT(*) FROM edge_agents WHERE branch_id = b.id) as gateways
      FROM branches b
      ORDER BY b.created_at DESC
    `);
    console.log('\n🏢 BRANCHES:');
    result.rows.forEach(b => {
      console.log(`   ${b.id} | ${b.name} | ${b.address || 'N/A'} | Gateways: ${b.gateways}`);
    });
  }
}

async function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       SENTINEL GRID - QUICK CLEANUP SCRIPT                 ║
╚════════════════════════════════════════════════════════════╝

USAGE:
  node quick-cleanup.mjs <action> [id]

ACTIONS:

  List:
    list-gateways          List all gateways
    list-cameras           List all cameras
    list-branches          List all branches

  Delete Single:
    delete-gateway <id>    Delete a specific gateway
    delete-camera <id>     Delete a specific camera
    delete-branch <id>     Delete a specific branch

  Delete All:
    delete-all-gateways    Delete ALL gateways
    delete-all-cameras     Delete ALL cameras
    delete-all-branches    Delete ALL branches

EXAMPLES:

  # List all gateways
  node quick-cleanup.mjs list-gateways

  # Delete specific gateway
  node quick-cleanup.mjs delete-gateway 00000000-0000-4000-8000-000000000104

  # Delete all cameras
  node quick-cleanup.mjs delete-all-cameras

  # Interactive mode (recommended)
  node admin-cleanup.mjs
`);
}

async function main() {
  try {
    await client.connect();
    
    if (!action || action === 'help' || action === '--help' || action === '-h') {
      showHelp();
    } else if (action === 'list-gateways') {
      await listAll('gateways');
    } else if (action === 'list-cameras') {
      await listAll('cameras');
    } else if (action === 'list-branches') {
      await listAll('branches');
    } else if (action === 'delete-gateway') {
      if (!id) {
        console.log('❌ Please provide gateway ID');
        process.exit(1);
      }
      await deleteGateway(id);
    } else if (action === 'delete-camera') {
      if (!id) {
        console.log('❌ Please provide camera ID');
        process.exit(1);
      }
      await deleteCamera(id);
    } else if (action === 'delete-branch') {
      if (!id) {
        console.log('❌ Please provide branch ID');
        process.exit(1);
      }
      await deleteBranch(id);
    } else if (action === 'delete-all-gateways') {
      await deleteAll('gateways');
    } else if (action === 'delete-all-cameras') {
      await deleteAll('cameras');
    } else if (action === 'delete-all-branches') {
      await deleteAll('branches');
    } else {
      console.log(`❌ Unknown action: ${action}`);
      showHelp();
      process.exit(1);
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

main();
