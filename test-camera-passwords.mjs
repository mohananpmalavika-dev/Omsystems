#!/usr/bin/env node

/**
 * Test multiple camera passwords
 * Helps find the correct password for your cameras
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CAMERA_IP = '192.168.29.171';

// Common camera passwords
const PASSWORDS_TO_TEST = [
  '4344@RaM4',      // Current one
  'admin',          // Most common
  '12345',
  'Admin@123',
  'admin123',
  '123456',
  'password',
  'camera',
  '888888',
  'admin1234',
  'Aa123456',
];

console.log(`🔐 Testing passwords for camera ${CAMERA_IP}...\n`);

for (const password of PASSWORDS_TO_TEST) {
  console.log(`Testing: admin / ${password.replace(/./g, '*')}`);
  
  try {
    // Try to connect using curl to ONVIF endpoint
    const cmd = `curl -s --connect-timeout 3 --digest --user "admin:${password}" "http://${CAMERA_IP}/onvif/device_service"`;
    
    const { stdout, stderr } = await execAsync(cmd, { timeout: 5000 });
    
    if (stdout && !stdout.includes('401') && !stdout.includes('Unauthorized') && stdout.length > 100) {
      console.log(`✅ SUCCESS! Password found: admin / ${password}\n`);
      console.log('💾 Saving to database...');
      
      // Save to database
      const saveCmd = `node save-camera-credentials-to-db.mjs admin "${password}" "${CAMERA_IP}"`;
      await execAsync(saveCmd, { cwd: process.cwd() });
      
      console.log('\n✅ Password saved! You can now run the scanner.');
      process.exit(0);
    }
  } catch (error) {
    // Password didn't work, try next one
  }
  
  console.log(`   ❌ Failed\n`);
  
  // Add delay to avoid lockout
  await new Promise(resolve => setTimeout(resolve, 1000));
}

console.log('❌ None of the common passwords worked.');
console.log('\n💡 Try these options:');
console.log('1. Check the camera manual for the default password');
console.log('2. Reset the camera to factory defaults');
console.log('3. Check if the camera uses a custom password from your installer');
console.log('4. Try accessing the camera web interface to confirm the password\n');
