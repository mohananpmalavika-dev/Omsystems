#!/usr/bin/env node
/**
 * Check user "dhanya" face enrollment via Control Plane API
 * (API server can access the GCP database)
 */

const CONTROL_PLANE_URL = 'https://sentinel-grid-control-plane-zcli.onrender.com';

console.log('🔍 Checking Face Enrollment via API');
console.log('=' .repeat(60));
console.log(`\nControl Plane: ${CONTROL_PLANE_URL}\n`);

console.log('📋 Manual Check Steps:\n');

console.log('1. Login to get access token:');
console.log(`   POST ${CONTROL_PLANE_URL}/api/v1/auth/login`);
console.log(`   Body: { "email": "dhanya" OR "mgdhanyamohan@omsystems.bank", "password": "dhanya123" }`);
console.log('');

console.log('2. Check user details:');
console.log(`   GET ${CONTROL_PLANE_URL}/api/v1/users/me`);
console.log(`   Header: Authorization: Bearer <access_token>`);
console.log('   Look for: preferences.faceVerification field');
console.log('');

console.log('3. Or list all users (if admin):');
console.log(`   GET ${CONTROL_PLANE_URL}/api/control/v1/users`);
console.log(`   Header: Authorization: Bearer <access_token>`);
console.log('   Search for user with face enrollment');
console.log('');

console.log('💻 Using curl:\n');
console.log('# Step 1: Login');
console.log(`curl -X POST ${CONTROL_PLANE_URL}/api/v1/auth/login \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"email":"dhanya","password":"dhanya123"}' \\`);
console.log(`  -c cookies.txt -b cookies.txt`);
console.log('');

console.log('# Step 2: Check user');
console.log(`curl ${CONTROL_PLANE_URL}/api/v1/users/me \\`);
console.log(`  -b cookies.txt`);
console.log('');

console.log('🌐 Using browser:\n');
console.log('1. Open browser DevTools (F12)');
console.log('2. Go to Network tab');
console.log(`3. Navigate to: ${CONTROL_PLANE_URL.replace('/api', '')}/login`);
console.log('4. Login with: dhanya / dhanya123');
console.log('5. Check Network requests for user data');
console.log('6. Look for "faceVerification" in response');
console.log('');

console.log('📱 What to look for in response:\n');
console.log('If face IS enrolled:');
console.log('  "preferences": {');
console.log('    "faceVerification": {');
console.log('      "version": 2,');
console.log('      "templates": [...],');
console.log('      "enrolledAt": "2026-09-16T..."');
console.log('    }');
console.log('  }');
console.log('');
console.log('If face NOT enrolled:');
console.log('  "preferences": {}  OR  "preferences": null');
console.log('');

console.log('=' .repeat(60));
console.log('\n💡 Next Steps Based on Results:');
console.log('   ✅ If enrolled: Check face login matching logic');
console.log('   ❌ If NOT enrolled: Need to capture face photos via Admin UI');
