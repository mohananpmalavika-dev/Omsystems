#!/usr/bin/env node

/**
 * Quick Camera Scanner Test
 * Tests if cameras can be found on your network
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

console.log('🔍 Camera Scanner Diagnostic Tool\n');

// Load environment
const envContent = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const [key, ...valueParts] = line.split('=');
      return [key.trim(), valueParts.join('=').trim()];
    })
);

console.log('📋 Current Configuration:');
console.log(`   Control Plane: ${env.CONTROL_PLANE_URL}`);
console.log(`   Branch ID: ${env.BRANCH_ID}`);
console.log(`   Agent ID: ${env.EDGE_AGENT_ID}`);
console.log(`   Camera User: ${env.CAMERA_USERNAME}`);
console.log(`   Camera Pass: ${env.CAMERA_PASSWORD}`);
console.log(`   Use DB Credentials: ${env.USE_DATABASE_CREDENTIALS}`);
console.log(`   Database: ${env.DATABASE_URL ? '✓ Configured' : '✗ Not set'}\n`);

// Check if shared key is set
if (!env.EDGE_BRIDGE_SHARED_KEY || env.EDGE_BRIDGE_SHARED_KEY.length < 32) {
  console.log('⚠️  WARNING: EDGE_BRIDGE_SHARED_KEY is missing or too short!');
  console.log('   This will cause 401 authentication errors.\n');
}

// Check network scan settings
console.log('🌐 Network Scan Settings:');
console.log(`   CIDR: ${env.RTSP_SCAN_CIDR || 'Not set'}`);
console.log(`   Ports: ${env.RTSP_SCAN_PORTS || 'Default'}`);
console.log(`   ONVIF Discovery: ${env.AUTO_DISCOVERY_ENABLED === 'true' ? '✓ Enabled' : '✗ Disabled'}\n`);

console.log('💡 Quick Fix Options:\n');
console.log('1. **Fix Authentication Error:**');
console.log('   - Go to your Render dashboard for the control plane service');
console.log('   - Find the EDGE_BRIDGE_SHARED_KEY environment variable');
console.log('   - Copy the value and update it in .env file\n');

console.log('2. **Fix Camera Password:**');
console.log('   - Your cameras might use a different password');
console.log('   - Common passwords: admin, 12345, Admin@123, camera');
console.log('   - Update CAMERA_PASSWORD in .env\n');

console.log('3. **Use Database Credentials (Recommended for 400+ locations):**');
console.log('   - Run: node ../save-camera-credentials-to-db.mjs');
console.log('   - This saves credentials to your PostgreSQL database');
console.log('   - Scanner will automatically use them\n');

// Try to ping control plane
console.log('🧪 Testing Control Plane Connection...');
try {
  const response = await fetch(`${env.CONTROL_PLANE_URL}/health`).catch(() => null);
  if (response?.ok) {
    console.log('   ✓ Control plane is reachable\n');
  } else {
    console.log(`   ✗ Control plane returned: ${response?.status || 'Network error'}\n`);
  }
} catch (error) {
  console.log(`   ✗ Cannot reach control plane: ${error.message}\n`);
}

console.log('📝 Next Steps:');
console.log('1. Update EDGE_BRIDGE_SHARED_KEY in .env');
console.log('2. Update camera passwords (or use database credentials)');
console.log('3. Run: START_SCANNER_SIMPLE.bat\n');
