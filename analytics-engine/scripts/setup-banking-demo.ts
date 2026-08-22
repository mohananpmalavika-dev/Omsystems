#!/usr/bin/env tsx
/**
 * Banking Analytics Demo Setup Script
 * 
 * Creates sample monitors, personnel, and scheduled visits
 * for testing and demonstration purposes.
 */

import {
  createExampleMonitor,
  addExamplePersonnel,
  scheduleExpectedVisit,
} from '../src/banking/banking-analytics-activation.js';

interface DemoConfig {
  tenantId: string;
  branchId: string;
  branchName: string;
}

async function setupBankingDemo(config: DemoConfig) {
  console.log('🏦 Banking Analytics Demo Setup');
  console.log('================================\n');

  const { tenantId, branchId, branchName } = config;

  console.log(`Setting up demo for: ${branchName}`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Branch ID: ${branchId}\n`);

  try {
    // Step 1: Create a cash van monitor
    console.log('📹 Step 1: Creating cash van monitor...');
    const monitorId = await createExampleMonitor(tenantId, branchId, {
      name: `${branchName} - Cash Van Monitor`,
      loadingZoneId: `zone-${branchId}-loading`,
      unloadingZoneId: `zone-${branchId}-unloading`,
      authorizedVehicles: ['DL01CA1234', 'DL02AB5678', 'MH01CD9012'],
      minimumPersonnel: 3,
      maxUnloadingDuration: 1800, // 30 minutes
    });
    console.log(`   Monitor ID: ${monitorId}\n`);

    // Step 2: Add personnel authorizations
    console.log('👥 Step 2: Adding personnel authorizations...');
    
    const personnel = [
      {
        identityId: `identity-${branchId}-john-doe`,
        name: 'John Doe',
        role: 'cash_guard' as const,
        badgeNumber: 'CG-001',
      },
      {
        identityId: `identity-${branchId}-jane-smith`,
        name: 'Jane Smith',
        role: 'cash_guard' as const,
        badgeNumber: 'CG-002',
      },
      {
        identityId: `identity-${branchId}-mike-johnson`,
        name: 'Mike Johnson',
        role: 'escort' as const,
        badgeNumber: 'ES-001',
      },
      {
        identityId: `identity-${branchId}-sarah-williams`,
        name: 'Sarah Williams',
        role: 'manager' as const,
        badgeNumber: 'MG-001',
      },
      {
        identityId: `identity-${branchId}-robert-brown`,
        name: 'Robert Brown',
        role: 'driver' as const,
        badgeNumber: 'DR-001',
      },
    ];

    for (const person of personnel) {
      await addExamplePersonnel(tenantId, branchId, person);
    }
    console.log(`   Added ${personnel.length} personnel\n`);

    // Step 3: Schedule expected visits
    console.log('📅 Step 3: Scheduling expected visits...');
    
    const now = new Date();
    const visits = [
      {
        vehiclePlateNumber: 'DL01CA1234',
        expectedArrival: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
        expectedDeparture: new Date(now.getTime() + 2.5 * 60 * 60 * 1000),
        purpose: 'Morning cash delivery',
        escortRequired: true,
      },
      {
        vehiclePlateNumber: 'DL02AB5678',
        expectedArrival: new Date(now.getTime() + 6 * 60 * 60 * 1000), // 6 hours from now
        expectedDeparture: new Date(now.getTime() + 6.5 * 60 * 60 * 1000),
        purpose: 'Afternoon cash collection',
        escortRequired: true,
      },
    ];

    for (const visit of visits) {
      await scheduleExpectedVisit(tenantId, branchId, monitorId, visit);
    }
    console.log(`   Scheduled ${visits.length} visits\n`);

    console.log('✅ Demo setup complete!\n');
    console.log('Next steps:');
    console.log('1. Start the analytics-engine with ENABLE_BANKING_ANALYTICS=true');
    console.log('2. Open the banking analytics dashboard');
    console.log('3. Simulate events using the mock event generator');
    console.log('4. Monitor sessions and violations in real-time\n');

    console.log('📊 Configuration Summary:');
    console.log(`   Monitor ID: ${monitorId}`);
    console.log(`   Personnel: ${personnel.length} authorized`);
    console.log(`   Scheduled Visits: ${visits.length}`);
    console.log(`   Authorized Vehicles: 3 (DL01CA1234, DL02AB5678, MH01CD9012)`);
    console.log(`   Minimum Personnel: 3`);
    console.log(`   Max Unloading Duration: 30 minutes\n`);

    return {
      monitorId,
      personnelIds: personnel.map(p => p.identityId),
      visitIds: visits.length,
    };

  } catch (error) {
    console.error('❌ Demo setup failed:', error);
    throw error;
  }
}

// Run the setup if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demoConfig: DemoConfig = {
    tenantId: process.env.DEMO_TENANT_ID || 'demo-tenant-001',
    branchId: process.env.DEMO_BRANCH_ID || 'branch-hq-001',
    branchName: process.env.DEMO_BRANCH_NAME || 'Headquarters Branch',
  };

  setupBankingDemo(demoConfig)
    .then((result) => {
      console.log('✅ Setup completed successfully');
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

export { setupBankingDemo };
