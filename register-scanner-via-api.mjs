#!/usr/bin/env node

/**
 * Register Camera Scanner via API
 * This script registers the H1 scanner using the backend API
 */

const CONTROL_PLANE_URL = 'https://sentinel-grid-control-plane1.onrender.com';
const GATEWAY_ID = 'e89264b4-9168-4b1b-8438-d61f7029668f';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';
const GATEWAY_NAME = 'H1';
const SHARED_KEY = 'WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa';

async function main() {
  console.log('🔧 Registering camera scanner via API...\n');

  try {
    // Register gateway using the edge bridge endpoint
    const response = await fetch(`${CONTROL_PLANE_URL}/edge-bridge/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edge-Bridge-Key': SHARED_KEY,
      },
      body: JSON.stringify({
        edgeAgentId: GATEWAY_ID,
        edgeAgentName: GATEWAY_NAME,
        branchId: BRANCH_ID,
        version: '0.1.0',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Registration failed: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${errorText}\n`);
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Camera scanner registered successfully!');
    console.log(`   ID: ${GATEWAY_ID}`);
    console.log(`   Name: ${GATEWAY_NAME}`);
    console.log(`   Branch ID: ${BRANCH_ID}\n`);

    console.log('💡 Next steps:');
    console.log('   1. The scanner should automatically connect within 30 seconds');
    console.log('   2. Refresh your dashboard to see the status change to "Running"');
    console.log('   3. The scanner will start finding cameras automatically\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
