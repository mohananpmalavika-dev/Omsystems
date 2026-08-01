#!/usr/bin/env node

import pkg from 'pg';
const { Client } = pkg;
import readline from 'readline';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function listGateways() {
  const result = await client.query(`
    SELECT id, name, status, last_seen_at, created_at
    FROM edge_agents
    ORDER BY created_at DESC
  `);
  
  console.log('\n📡 GATEWAYS:');
  console.log('─'.repeat(80));
  if (result.rows.length === 0) {
    console.log('No gateways found.');
  } else {
    result.rows.forEach((g, i) => {
      console.log(`${i + 1}. ${g.name} (${g.id})`);
      console.log(`   Status: ${g.status} | Last seen: ${g.last_seen_at || 'Never'}`);
    });
  }
  console.log('─'.repeat(80));
  return result.rows;
}

async function listCameras() {
  const result = await client.query(`
    SELECT c.id, c.model, c.ip_address, c.status, c.edge_agent_id,
           e.name as gateway_name
    FROM cameras c
    LEFT JOIN edge_agents e ON c.edge_agent_id = e.id
    ORDER BY c.created_at DESC
  `);
  
  console.log('\n📹 CAMERAS:');
  console.log('─'.repeat(80));
  if (result.rows.length === 0) {
    console.log('No cameras found.');
  } else {
    result.rows.forEach((c, i) => {
      console.log(`${i + 1}. ${c.model} - ${c.ip_address} (${c.id})`);
      console.log(`   Gateway: ${c.gateway_name || 'None'} | Status: ${c.status}`);
    });
  }
  console.log('─'.repeat(80));
  return result.rows;
}

async function listBranches() {
  const result = await client.query(`
    SELECT b.id, b.name, b.address, b.created_at,
           (SELECT COUNT(*) FROM edge_agents WHERE branch_id = b.id) as gateway_count
    FROM branches b
    ORDER BY b.created_at DESC
  `);
  
  console.log('\n🏢 BRANCHES:');
  console.log('─'.repeat(80));
  if (result.rows.length === 0) {
    console.log('No branches found.');
  } else {
    result.rows.forEach((b, i) => {
      console.log(`${i + 1}. ${b.name} (${b.id})`);
      console.log(`   Address: ${b.address || 'N/A'} | Gateways: ${b.gateway_count}`);
    });
  }
  console.log('─'.repeat(80));
  return result.rows;
}

async function deleteGateway(gatewayId) {
  try {
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
    console.log(`   ✓ Gateway deleted`);
    
    console.log('\n✅ Gateway and all dependent records deleted successfully!');
  } catch (error) {
    console.error('❌ Error deleting gateway:', error.message);
  }
}

async function deleteCamera(cameraId) {
  try {
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
    console.log(`   ✓ Camera deleted`);
    
    console.log('\n✅ Camera and all dependent records deleted successfully!');
  } catch (error) {
    console.error('❌ Error deleting camera:', error.message);
  }
}

async function deleteBranch(branchId) {
  try {
    const branch = await client.query('SELECT name FROM branches WHERE id = $1', [branchId]);
    
    if (branch.rows.length === 0) {
      console.log('❌ Branch not found.');
      return;
    }
    
    console.log(`\n🗑️  Deleting branch: ${branch.rows[0].name}`);
    
    const gateways = await client.query('SELECT id, name FROM edge_agents WHERE branch_id = $1', [branchId]);
    console.log(`   Found ${gateways.rows.length} gateways in this branch`);
    
    for (const gateway of gateways.rows) {
      console.log(`   Deleting gateway: ${gateway.name}...`);
      await deleteGatewayQuiet(gateway.id);
    }
    
    await client.query('DELETE FROM branches WHERE id = $1', [branchId]);
    console.log(`   ✓ Branch deleted`);
    
    console.log('\n✅ Branch and all dependent records deleted successfully!');
  } catch (error) {
    console.error('❌ Error deleting branch:', error.message);
  }
}

async function deleteGatewayQuiet(gatewayId) {
  await client.query('DELETE FROM cameras WHERE edge_agent_id = $1', [gatewayId]);
  await client.query('DELETE FROM edge_agent_telemetry WHERE edge_agent_id = $1', [gatewayId]);
  await client.query('DELETE FROM camera_discovery_records WHERE edge_agent_id = $1', [gatewayId]);
  await client.query('DELETE FROM camera_scan_jobs WHERE edge_agent_id = $1', [gatewayId]);
  await client.query('DELETE FROM live_sessions WHERE edge_agent_id = $1', [gatewayId]);
  await client.query('DELETE FROM edge_agents WHERE id = $1', [gatewayId]);
}

async function deleteAllGateways() {
  const confirm = await question('\n⚠️  DELETE ALL GATEWAYS? This will delete ALL gateways and their cameras! Type "DELETE ALL" to confirm: ');
  
  if (confirm !== 'DELETE ALL') {
    console.log('❌ Cancelled.');
    return;
  }
  
  try {
    const gateways = await client.query('SELECT id, name FROM edge_agents');
    console.log(`\n🗑️  Deleting ${gateways.rows.length} gateways...`);
    
    for (const gateway of gateways.rows) {
      console.log(`   Deleting: ${gateway.name}...`);
      await deleteGatewayQuiet(gateway.id);
    }
    
    console.log('\n✅ All gateways deleted successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function deleteAllCameras() {
  const confirm = await question('\n⚠️  DELETE ALL CAMERAS? Type "DELETE ALL" to confirm: ');
  
  if (confirm !== 'DELETE ALL') {
    console.log('❌ Cancelled.');
    return;
  }
  
  try {
    const liveSessions = await client.query('DELETE FROM live_sessions');
    console.log(`   ✓ Deleted ${liveSessions.rowCount} live sessions`);
    
    const discoveries = await client.query('DELETE FROM camera_discovery_records WHERE camera_id IS NOT NULL');
    console.log(`   ✓ Deleted ${discoveries.rowCount} discovery records`);
    
    const cameras = await client.query('DELETE FROM cameras');
    console.log(`   ✓ Deleted ${cameras.rowCount} cameras`);
    
    console.log('\n✅ All cameras deleted successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function deleteAllBranches() {
  const confirm = await question('\n⚠️  DELETE ALL BRANCHES? This will delete ALL branches, gateways, and cameras! Type "DELETE ALL" to confirm: ');
  
  if (confirm !== 'DELETE ALL') {
    console.log('❌ Cancelled.');
    return;
  }
  
  try {
    const branches = await client.query('SELECT id, name FROM branches');
    console.log(`\n🗑️  Deleting ${branches.rows.length} branches...`);
    
    for (const branch of branches.rows) {
      console.log(`   Deleting: ${branch.name}...`);
      
      const gateways = await client.query('SELECT id FROM edge_agents WHERE branch_id = $1', [branch.id]);
      for (const gateway of gateways.rows) {
        await deleteGatewayQuiet(gateway.id);
      }
      
      await client.query('DELETE FROM branches WHERE id = $1', [branch.id]);
    }
    
    console.log('\n✅ All branches deleted successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function showStats() {
  const stats = await client.query(`
    SELECT 
      (SELECT COUNT(*) FROM branches) as branches,
      (SELECT COUNT(*) FROM edge_agents) as gateways,
      (SELECT COUNT(*) FROM cameras) as cameras,
      (SELECT COUNT(*) FROM live_sessions) as live_sessions,
      (SELECT COUNT(*) FROM edge_agent_telemetry) as telemetry_records
  `);
  
  console.log('\n📊 DATABASE STATISTICS:');
  console.log('─'.repeat(50));
  console.log(`Branches:          ${stats.rows[0].branches}`);
  console.log(`Gateways:          ${stats.rows[0].gateways}`);
  console.log(`Cameras:           ${stats.rows[0].cameras}`);
  console.log(`Live Sessions:     ${stats.rows[0].live_sessions}`);
  console.log(`Telemetry Records: ${stats.rows[0].telemetry_records}`);
  console.log('─'.repeat(50));
}

async function mainMenu() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         SENTINEL GRID - ADMIN CLEANUP TOOL                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  await showStats();
  
  console.log('\n📋 MAIN MENU:');
  console.log('─'.repeat(50));
  console.log('1. List Gateways');
  console.log('2. List Cameras');
  console.log('3. List Branches');
  console.log('─'.repeat(50));
  console.log('4. Delete Gateway (by ID)');
  console.log('5. Delete Camera (by ID)');
  console.log('6. Delete Branch (by ID)');
  console.log('─'.repeat(50));
  console.log('7. Delete ALL Gateways');
  console.log('8. Delete ALL Cameras');
  console.log('9. Delete ALL Branches');
  console.log('─'.repeat(50));
  console.log('0. Exit');
  console.log('─'.repeat(50));
  
  const choice = await question('\nEnter your choice: ');
  
  switch (choice) {
    case '1':
      await listGateways();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '2':
      await listCameras();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '3':
      await listBranches();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '4':
      await listGateways();
      const gatewayId = await question('\nEnter Gateway ID to delete (or press Enter to cancel): ');
      if (gatewayId) {
        const confirm = await question(`⚠️  Are you sure? Type "DELETE" to confirm: `);
        if (confirm === 'DELETE') {
          await deleteGateway(gatewayId);
        } else {
          console.log('❌ Cancelled.');
        }
      }
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '5':
      await listCameras();
      const cameraId = await question('\nEnter Camera ID to delete (or press Enter to cancel): ');
      if (cameraId) {
        const confirm = await question(`⚠️  Are you sure? Type "DELETE" to confirm: `);
        if (confirm === 'DELETE') {
          await deleteCamera(cameraId);
        } else {
          console.log('❌ Cancelled.');
        }
      }
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '6':
      await listBranches();
      const branchId = await question('\nEnter Branch ID to delete (or press Enter to cancel): ');
      if (branchId) {
        const confirm = await question(`⚠️  Are you sure? This will delete the branch and ALL its gateways! Type "DELETE" to confirm: `);
        if (confirm === 'DELETE') {
          await deleteBranch(branchId);
        } else {
          console.log('❌ Cancelled.');
        }
      }
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '7':
      await deleteAllGateways();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '8':
      await deleteAllCameras();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '9':
      await deleteAllBranches();
      await question('\nPress Enter to continue...');
      await mainMenu();
      break;
      
    case '0':
      console.log('\n👋 Goodbye!');
      rl.close();
      await client.end();
      process.exit(0);
      break;
      
    default:
      console.log('\n❌ Invalid choice. Please try again.');
      await question('Press Enter to continue...');
      await mainMenu();
      break;
  }
}

// Start the application
async function start() {
  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');
    await mainMenu();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    rl.close();
    process.exit(1);
  }
}

start();
