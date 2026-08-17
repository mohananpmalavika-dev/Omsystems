#!/usr/bin/env node

/**
 * Check Production Gateway Status via API
 * This queries the production API to check gateway status
 */

const CONTROL_PLANE_URL = 'https://sentinel-grid-control-plane-ocn1.onrender.com';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';

// You'll need to get a valid token from the dashboard
// Open your browser's devtools > Application > Cookies > Copy the sentinel_session value
const SESSION_TOKEN = process.argv[2];

if (!SESSION_TOKEN) {
  console.log('Usage: node check-production-gateway.mjs <session-token>');
  console.log('\nTo get your session token:');
  console.log('1. Open https://sentinel-grid-monitoring-vhid.onrender.com in browser');
  console.log('2. Open DevTools (F12)');
  console.log('3. Go to Application tab > Cookies');
  console.log('4. Copy the value of "sentinel_session"');
  console.log('5. Run: node check-production-gateway.mjs <token>\n');
  process.exit(1);
}

async function main() {
  console.log('🔍 Checking production gateway status...\n');

  try {
    // Get gateways for the branch
    const response = await fetch(`${CONTROL_PLANE_URL}/v1/branches/${BRANCH_ID}/edge-agents`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SESSION_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to get gateways: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${errorText}\n`);
      process.exit(1);
    }

    const result = await response.json();
    console.log('📋 Registered Camera Scanners:');
    console.log('─'.repeat(60));
    
    if (!result.data || result.data.length === 0) {
      console.log('   No scanners registered');
    } else {
      result.data.forEach((agent) => {
        console.log(`   ID: ${agent.id}`);
        console.log(`   Name: ${agent.name}`);
        console.log(`   Status: ${agent.status}`);
        console.log(`   Last Seen: ${agent.lastSeenAt || 'Never'}`);
        console.log(`   Version: ${agent.version || 'Unknown'}`);
        console.log('─'.repeat(60));
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
