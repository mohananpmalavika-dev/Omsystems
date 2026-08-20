#!/usr/bin/env node
/**
 * Check cameras via API endpoints
 */

const API_URL = process.env.CONTROL_PLANE_PUBLIC_URL || 'http://localhost:3000';
const USER_ID = 'user-global-admin'; // Development mode user

console.log('\n🔍 CHECKING CAMERAS VIA API\n');
console.log('API URL:', API_URL);
console.log('═'.repeat(80));

async function checkAPI() {
  try {
    // Get branches
    console.log('\n📍 Fetching branches...');
    const branchesRes = await fetch(`${API_URL}/v1/branches`, {
      headers: { 'x-user-id': USER_ID }
    });
    
    if (!branchesRes.ok) {
      throw new Error(`API returned ${branchesRes.status}: ${branchesRes.statusText}`);
    }
    
    const branches = await branchesRes.json();
    console.log(`Found ${branches.data.length} branch(es)`);
    
    if (branches.data.length === 0) {
      console.log('\n❌ No branches found. Please create a branch first.\n');
      return;
    }
    
    const branch = branches.data[0];
    console.log(`\nUsing branch: ${branch.name} (${branch.id})`);
    
    // Get discovered cameras
    console.log('\n📡 Fetching discovered cameras...');
    const discoveredRes = await fetch(`${API_URL}/v1/branches/${branch.id}/cameras/discovered`, {
      headers: { 'x-user-id': USER_ID }
    });
    
    if (discoveredRes.ok) {
      const discovered = await discoveredRes.json();
      console.log(`\n✅ DISCOVERED CAMERAS: ${discovered.data.length}\n`);
      
      if (discovered.data.length === 0) {
        console.log('   No cameras discovered yet. Run a network scan from the UI.\n');
      } else {
        discovered.data.forEach((cam, idx) => {
          console.log(`${idx + 1}. ${cam.displayName || cam.model || 'Unknown'}`);
          console.log(`   IP: ${cam.ipAddress}`);
          console.log(`   Type: ${cam.sourceType || 'ip-camera'}`);
          console.log(`   Status: ${cam.status}`);
          console.log(`   Stream Verified: ${cam.streamVerified ? '✓' : '✗'}`);
          console.log(`   Credentials Required: ${cam.credentialsRequired ? 'YES ⚠️' : 'NO'}`);
          console.log(`   Duplicate: ${cam.duplicateStatus || 'unique'}`);
          console.log(`   Compatibility: ${cam.compatibilityStatus || 'unknown'}`);
          console.log('');
        });
      }
    }
    
    // Get provisioned cameras
    console.log('\n📹 Fetching provisioned cameras...');
    const camerasRes = await fetch(`${API_URL}/v1/branches/${branch.id}/cameras`, {
      headers: { 'x-user-id': USER_ID }
    });
    
    if (camerasRes.ok) {
      const cameras = await camerasRes.json();
      console.log(`\n✅ PROVISIONED CAMERAS: ${cameras.data.length}\n`);
      
      if (cameras.data.length === 0) {
        console.log('   No cameras provisioned yet.\n');
      } else {
        cameras.data.forEach((cam, idx) => {
          console.log(`${idx + 1}. ${cam.name}`);
          console.log(`   ID: ${cam.id}`);
          console.log(`   Status: ${cam.status}`);
          console.log(`   Branch: ${cam.branchName || 'Unknown'}`);
          if (cam.ipAddress) console.log(`   IP: ${cam.ipAddress}`);
          console.log('');
        });
      }
    }
    
    console.log('═'.repeat(80));
    console.log('\n✅ API check complete\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure the backend server is running on', API_URL);
    console.error('\nStart it with: npm run dev\n');
  }
}

checkAPI();
