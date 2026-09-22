#!/usr/bin/env tsx
/**
 * Storage Telemetry Seed Script
 * 
 * Generates realistic storage telemetry data for testing and development.
 * This ensures the Predictive Operations dashboard displays storage volumes.
 * 
 * Usage:
 *   npm run seed:storage
 *   # or
 *   tsx scripts/seed-storage-telemetry.ts
 */

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

// Database connection from environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/sentinel';
const sql = postgres(DATABASE_URL);

interface StorageDevice {
  deviceId: string;
  name: string;
  capacityTb: number;
  usedPercent: number;
  dailyGrowthGb: number;
  smartStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  temperatureC: number;
}

// Generate realistic storage configurations
const storageProfiles: StorageDevice[] = [
  { deviceId: 'disk-01', name: 'HDD-1 (System)', capacityTb: 4, usedPercent: 45, dailyGrowthGb: 25, smartStatus: 'HEALTHY', temperatureC: 35 },
  { deviceId: 'disk-02', name: 'HDD-2 (Recording)', capacityTb: 10, usedPercent: 72, dailyGrowthGb: 85, smartStatus: 'HEALTHY', temperatureC: 38 },
  { deviceId: 'disk-03', name: 'HDD-3 (Recording)', capacityTb: 10, usedPercent: 68, dailyGrowthGb: 80, smartStatus: 'HEALTHY', temperatureC: 36 },
  { deviceId: 'disk-04', name: 'SSD-1 (Cache)', capacityTb: 1, usedPercent: 55, dailyGrowthGb: 10, smartStatus: 'HEALTHY', temperatureC: 42 },
  { deviceId: 'disk-05', name: 'HDD-4 (Backup)', capacityTb: 8, usedPercent: 85, dailyGrowthGb: 35, smartStatus: 'WARNING', temperatureC: 45 },
  { deviceId: 'disk-06', name: 'HDD-5 (Archive)', capacityTb: 12, usedPercent: 92, dailyGrowthGb: 15, smartStatus: 'CRITICAL', temperatureC: 48 },
];

function calculateMetrics(profile: StorageDevice) {
  const totalBytes = profile.capacityTb * 1e12;
  const usedBytes = totalBytes * (profile.usedPercent / 100);
  const freeBytes = totalBytes - usedBytes;
  const dailyWriteBytes = profile.dailyGrowthGb * 1e9;
  const daysRemaining = dailyWriteBytes > 0 ? freeBytes / dailyWriteBytes : 999;
  
  return {
    // Capacity metrics (multiple formats for compatibility)
    totalBytes,
    capacityBytes: totalBytes,
    capacityGB: profile.capacityTb * 1000,
    usedBytes,
    usedGB: (usedBytes / 1e9).toFixed(2),
    freeBytes,
    availableBytes: freeBytes,
    
    // Growth and prediction metrics
    dailyWriteRateBytes: dailyWriteBytes,
    dailyIngestGb: profile.dailyGrowthGb,
    growthRatePerDay: dailyWriteBytes,
    estimatedDaysRemaining: Math.floor(daysRemaining),
    daysRemaining: Math.floor(daysRemaining),
    
    // Health metrics
    smartStatus: profile.smartStatus,
    healthStatus: profile.smartStatus,
    temperatureC: profile.temperatureC,
    temperature: profile.temperatureC,
    
    // SMART attributes
    reallocatedSectors: profile.smartStatus === 'CRITICAL' ? 150 : profile.smartStatus === 'WARNING' ? 25 : 0,
    pendingSectors: profile.smartStatus === 'CRITICAL' ? 45 : profile.smartStatus === 'WARNING' ? 5 : 0,
    powerOnHours: Math.floor(Math.random() * 50000) + 10000,
    
    // Additional metadata
    name: profile.name,
    deviceName: profile.name,
    model: profile.name.startsWith('SSD') ? 'Samsung 970 EVO' : 'WD Red Plus 10TB',
    tier: profile.name.includes('Cache') ? 'Hot' : profile.name.includes('Archive') ? 'Cold' : 'Warm',
    storageTier: profile.name.includes('Cache') ? 'hot' : profile.name.includes('Archive') ? 'cold' : 'warm',
    mediaType: profile.name.startsWith('SSD') ? 'SSD' : 'HDD',
  };
}

async function seedStorageTelemetry() {
  console.log('🔍 Checking database connection...');
  
  // Get tenant and branch info
  const tenants = await sql`
    SELECT id, name FROM tenants WHERE is_active = true LIMIT 1
  `;
  
  if (tenants.length === 0) {
    console.error('❌ No active tenants found. Please create a tenant first.');
    process.exit(1);
  }
  
  const tenant = tenants[0];
  console.log(`✅ Using tenant: ${tenant.name} (${tenant.id})`);
  
  // Get branches for this tenant
  const branches = await sql`
    SELECT id, name FROM resource_nodes 
    WHERE tenant_id = ${tenant.id} 
      AND node_type = 'branch' 
      AND is_active = true
    LIMIT 5
  `;
  
  if (branches.length === 0) {
    console.error('❌ No active branches found. Please create branches first.');
    process.exit(1);
  }
  
  console.log(`✅ Found ${branches.length} branches`);
  
  // Get or create edge agents
  let agents = await sql`
    SELECT id, name, branch_id FROM edge_agents 
    WHERE is_active = true
    LIMIT ${branches.length}
  `;
  
  if (agents.length === 0) {
    console.log('📝 Creating edge agents...');
    const agentInserts = branches.map((branch) => ({
      id: randomUUID(),
      tenant_id: tenant.id,
      branch_id: branch.id,
      name: `Edge Agent - ${branch.name}`,
      status: 'online',
      version: '1.0.0',
      last_heartbeat_at: new Date().toISOString(),
      is_active: true,
    }));
    
    agents = await sql`
      INSERT INTO edge_agents ${sql(agentInserts)}
      RETURNING id, name, branch_id
    `;
    
    console.log(`✅ Created ${agents.length} edge agents`);
  }
  
  console.log(`✅ Using ${agents.length} edge agents`);
  console.log('');
  console.log('📊 Generating storage telemetry...');
  console.log('');
  
  let totalRecords = 0;
  const observedAt = new Date();
  
  // Generate storage telemetry for each branch
  for (const agent of agents) {
    const branch = branches.find((b) => b.id === agent.branch_id);
    if (!branch) continue;
    
    console.log(`  Branch: ${branch.name}`);
    
    // Each branch gets 2-4 storage devices
    const deviceCount = Math.floor(Math.random() * 3) + 2;
    const selectedDevices = storageProfiles.slice(0, deviceCount);
    
    for (const device of selectedDevices) {
      const metrics = calculateMetrics(device);
      const quality = device.smartStatus === 'HEALTHY' ? 'verified' : device.smartStatus === 'WARNING' ? 'estimated' : 'degraded';
      
      const telemetryRecord = {
        id: randomUUID(),
        tenant_id: tenant.id,
        branch_id: branch.id,
        edge_agent_id: agent.id,
        device_type: 'disk',
        device_id: `${branch.id.slice(0, 8)}-${device.deviceId}`,
        metrics: JSON.stringify(metrics),
        quality,
        observed_at: observedAt.toISOString(),
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      
      await sql`
        INSERT INTO operational_telemetry ${sql(telemetryRecord)}
        ON CONFLICT (tenant_id, branch_id, device_type, device_id) 
        DO UPDATE SET
          metrics = EXCLUDED.metrics,
          quality = EXCLUDED.quality,
          observed_at = EXCLUDED.observed_at,
          received_at = EXCLUDED.received_at,
          created_at = EXCLUDED.created_at
      `;
      
      const daysRemaining = metrics.estimatedDaysRemaining;
      const statusIcon = device.smartStatus === 'HEALTHY' ? '✅' : device.smartStatus === 'WARNING' ? '⚠️' : '❌';
      
      console.log(
        `    ${statusIcon} ${device.name}: ${profile.capacityTb}TB, ` +
        `${profile.usedPercent}% used, ${daysRemaining} days remaining`
      );
      
      totalRecords++;
    }
  }
  
  console.log('');
  console.log(`✅ Successfully inserted ${totalRecords} storage telemetry records`);
  console.log('');
  console.log('🔍 Verifying data...');
  
  // Verify the data was inserted
  const verification = await sql`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT branch_id) as branches_with_data,
      COUNT(DISTINCT device_id) as unique_devices,
      MAX(created_at) as latest_record
    FROM operational_telemetry
    WHERE tenant_id = ${tenant.id}
      AND device_type = 'disk'
      AND created_at > NOW() - INTERVAL '5 minutes'
  `;
  
  console.log('  Total Records:', verification[0].total_records);
  console.log('  Branches with Data:', verification[0].branches_with_data);
  console.log('  Unique Devices:', verification[0].unique_devices);
  console.log('  Latest Record:', verification[0].latest_record);
  console.log('');
  console.log('✅ Storage telemetry seeding complete!');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('  1. Visit the Predictive Operations dashboard: /analytics/predictions');
  console.log('  2. Filter by "Storage" domain to see the volumes');
  console.log('  3. Click "Refresh telemetry" if data doesn\'t appear immediately');
  console.log('');
  console.log('🔗 Test API Endpoint:');
  console.log('  GET /api/control/v1/maintenance/predictive/dashboard?horizonHours=48');
  console.log('');
}

// Run the seeder
seedStorageTelemetry()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error seeding storage telemetry:', error);
    process.exit(1);
  });
