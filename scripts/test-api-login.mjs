const API_URL = process.env.API_URL || 'http://3.7.216.169:8080';
const testPassword = process.env.TEST_PASSWORD;
if (!testPassword) throw new Error('TEST_PASSWORD is required');

console.log('🧪 Testing Login API Endpoint\n');
console.log('API URL:', API_URL);
console.log('Endpoint:', API_URL + '/v1/auth/login');
console.log('');

const testCases = [
  {
    name: 'Test 1: Without tenant slug',
    payload: {
      username: 'mgdhanyamohan',
      password: testPassword
    }
  },
  {
    name: 'Test 2: With tenant slug',
    payload: {
      username: 'mgdhanyamohan',
      password: testPassword,
      tenantSlug: 'omsystems-pilot'
    }
  },
  {
    name: 'Test 3: Wrong password (should fail)',
    payload: {
      username: 'mgdhanyamohan',
      password: 'WrongPassword123'
    }
  }
];

for (const test of testCases) {
  console.log('─'.repeat(60));
  console.log(test.name);
  console.log('Payload:', JSON.stringify(test.payload, null, 2));
  console.log('');
  
  try {
    const response = await fetch(API_URL + '/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(test.payload)
    });
    
    console.log('Status:', response.status, response.statusText);
    
    const data = await response.json().catch(() => null);
    
    if (response.ok) {
      console.log('✅ SUCCESS');
      console.log('User:', data?.user?.username);
      console.log('Role:', data?.user?.role);
      console.log('Token received:', data?.accessToken ? 'Yes' : 'No');
    } else {
      console.log('❌ FAILED');
      console.log('Error:', data?.error);
      console.log('Message:', data?.message);
    }
    
  } catch (error) {
    console.log('❌ REQUEST ERROR');
    console.log('Error:', error.message);
  }
  
  console.log('');
}

console.log('─'.repeat(60));
console.log('\n💡 Analysis:');
console.log('- If Test 1 or 2 succeeds: Login works! Try again in your browser');
console.log('- If all tests fail with 401: Backend might not be using the updated database');
console.log('- If connection fails: Backend might not be deployed yet');
