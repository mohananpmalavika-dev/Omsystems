#!/usr/bin/env node
/**
 * Test login credentials for user "dhanya"
 */

console.log('🔐 Testing Login Credentials\n');

const testCredentials = [
  { username: 'dhanya', password: 'dhanya123' },
  { username: 'mgdhanyamohan', password: 'dhanya123' },
  { username: 'mgdhanyamohan', password: 'mgdhanyamohan' },
];

console.log('To test these credentials, try:');
console.log('\n1. Login via API:');
console.log('   POST https://sentinel-grid-control-plane-zcli.onrender.com/api/v1/auth/login');
console.log('   Body: { "email": "username", "password": "password" }\n');

console.log('2. Or login via dashboard:');
console.log('   URL: https://your-dashboard-url.com/login\n');

console.log('Test these combinations:');
testCredentials.forEach((cred, i) => {
  console.log(`   ${i + 1}. Username: "${cred.username}" | Password: "${cred.password}"`);
});

console.log('\n📋 Current user in database:');
console.log('   Username: mgdhanyamohan');
console.log('   Email: mgdhanyamohan@omsystems.bank');
console.log('   Status: active');
console.log('   Role: super_admin');
console.log('   Face Enrolled: ❌ NO\n');

console.log('💡 Next Steps:');
console.log('   1. Try logging in with mgdhanyamohan + your password');
console.log('   2. Once logged in, go to Admin → Organization → Employees');
console.log('   3. Edit your own user (mgdhanyamohan)');
console.log('   4. Capture 3-5 face photos');
console.log('   5. Save - face enrollment will be complete');
console.log('   6. Logout and try face login\n');
