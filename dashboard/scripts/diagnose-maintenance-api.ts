#!/usr/bin/env node
/**
 * Diagnostic script to test maintenance API connectivity
 * Run with: npx tsx dashboard/scripts/diagnose-maintenance-api.ts
 */

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 
                          process.env.CONTROL_PLANE_INTERNAL_URL || 
                          'http://3.7.216.169:8080';

async function diagnose() {
  console.log('🔍 Diagnosing Maintenance API Connectivity\n');
  console.log(`Control Plane URL: ${CONTROL_PLANE_URL}\n`);

  // Test 1: Backend health
  console.log('Test 1: Checking backend health...');
  try {
    const healthResponse = await fetch(`${CONTROL_PLANE_URL}/health`);
    if (healthResponse.ok) {
      console.log('✅ Backend is reachable');
      const health = await healthResponse.json();
      console.log(`   Status: ${health.status || 'ok'}\n`);
    } else {
      console.log(`❌ Backend returned status ${healthResponse.status}\n`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Cannot reach backend: ${msg}\n`);
    return;
  }

  // Test 2: Maintenance route (unauthenticated)
  console.log('Test 2: Testing maintenance route (unauthenticated)...');
  try {
    const response = await fetch(`${CONTROL_PLANE_URL}/v1/maintenance/workorders`);
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('✅ Route exists (returns 401 Unauthorized as expected)\n');
    } else if (response.status === 404) {
      console.log('❌ Route not found (404)\n');
    } else if (response.status === 200) {
      console.log('⚠️  Route accessible without auth (security issue?)\n');
    } else {
      console.log(`⚠️  Unexpected status: ${response.status}\n`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Error testing route: ${msg}\n`);
  }

  // Test 3: Environment variables
  console.log('Test 3: Checking environment variables...');
  const envVars = {
    'CONTROL_PLANE_URL': process.env.CONTROL_PLANE_URL,
    'CONTROL_PLANE_INTERNAL_URL': process.env.CONTROL_PLANE_INTERNAL_URL,
    'NEXT_PUBLIC_API_URL': process.env.NEXT_PUBLIC_API_URL,
    'NODE_ENV': process.env.NODE_ENV,
  };

  for (const [key, value] of Object.entries(envVars)) {
    if (value) {
      console.log(`   ✅ ${key}: ${value}`);
    } else {
      console.log(`   ⚠️  ${key}: not set`);
    }
  }
  console.log();

  // Test 4: DNS resolution
  console.log('Test 4: Testing DNS resolution...');
  try {
    const url = new URL(CONTROL_PLANE_URL);
    console.log(`   Hostname: ${url.hostname}`);
    console.log(`   Protocol: ${url.protocol}`);
    console.log('   ✅ URL is valid\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Invalid URL: ${msg}\n`);
  }

  console.log('📋 Summary');
  console.log('─────────────────────────────────────────────────');
  console.log('If you see "Backend is reachable" and "Route exists",');
  console.log('the issue is likely with authentication or CORS.');
  console.log();
  console.log('Next steps:');
  console.log('1. Ensure you are logged in to the dashboard');
  console.log('2. Check browser console for CORS errors');
  console.log('3. Verify CONTROL_PLANE_URL in deployment env vars');
  console.log('4. Check that session cookie is being sent');
}

diagnose().catch(console.error);
