#!/usr/bin/env node
/**
 * Test API Login
 * Makes an actual HTTP request to the login endpoint
 */

async function testAPILogin() {
  const apiUrl = 'https://sentinel-grid-monitoring1.onrender.com/api/control/v1/auth/login';
  
  const testPassword = process.env.TEST_PASSWORD;
  if (!testPassword) throw new Error('TEST_PASSWORD is required');
  const credentials = {
    username: 'mgdhanyamohan',
    password: testPassword
  };

  console.log('Testing API login...');
  console.log(`URL: ${apiUrl}`);
  console.log(`Username: ${credentials.username}\n`);

  try {
    // Test without tenant slug
    console.log('1️⃣  Attempting login WITHOUT tenant slug...');
    const response1 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });

    console.log(`   Status: ${response1.status} ${response1.statusText}`);
    
    if (!response1.ok) {
      const error = await response1.json().catch(() => ({ error: 'Unable to parse response' }));
      console.log(`   Error:`, JSON.stringify(error, null, 2));
    } else {
      const data = await response1.json();
      console.log(`   ✅ Success!`);
      console.log(`   Token Type: ${data.tokenType}`);
      console.log(`   User: ${data.user?.displayName} (${data.user?.role})\n`);
      return;
    }

    // Test with tenant slug
    console.log('\n2️⃣  Attempting login WITH tenant slug...');
    const credentialsWithTenant = {
      ...credentials,
      tenantSlug: 'omsystems-pilot'
    };

    const response2 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentialsWithTenant)
    });

    console.log(`   Status: ${response2.status} ${response2.statusText}`);
    
    if (!response2.ok) {
      const error = await response2.json().catch(() => ({ error: 'Unable to parse response' }));
      console.log(`   Error:`, JSON.stringify(error, null, 2));
    } else {
      const data = await response2.json();
      console.log(`   ✅ Success!`);
      console.log(`   Token Type: ${data.tokenType}`);
      console.log(`   User: ${data.user?.displayName} (${data.user?.role})\n`);
    }

  } catch (error) {
    console.error('\n❌ Network Error:', error.message);
    console.log('\nPossible issues:');
    console.log('- Server is down or hibernating (Render free tier)');
    console.log('- Network connectivity issues');
    console.log('- CORS errors (check browser console)');
  }
}

testAPILogin();
