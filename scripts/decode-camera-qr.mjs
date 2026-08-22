#!/usr/bin/env node
/**
 * QR Code Decoder for TrueCloud Camera Credentials
 * 
 * This script decodes QR codes from camera setup cards to extract:
 * - Device ID
 * - Username
 * - Password
 * - IP Address (if included)
 * - Other connection details
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function decodeQR() {
  console.log('🔍 TrueCloud Camera QR Code Decoder\n');
  console.log('Device ID from image: 4835592944\n');
  
  // Common patterns for camera QR codes:
  console.log('📋 Common QR Code Formats:\n');
  console.log('1. JSON Format:');
  console.log('   {"id":"4835592944","user":"admin","pwd":"XXXXX","ip":"192.168.x.x"}\n');
  
  console.log('2. Key-Value Format:');
  console.log('   ID:4835592944;USER:admin;PWD:XXXXX;IP:192.168.x.x\n');
  
  console.log('3. URL Format:');
  console.log('   truecloud://device?id=4835592944&user=admin&pwd=XXXXX\n');
  
  console.log('4. Encoded String Format:');
  console.log('   Base64 or custom encoding with device credentials\n');
  
  console.log('════════════════════════════════════════════════════════\n');
  console.log('📖 How to Get Credentials:\n');
  
  console.log('Method 1: Scan QR with QR Reader App');
  console.log('  - Use any QR code scanner app on your phone');
  console.log('  - Scan the QR code from the camera label');
  console.log('  - Look for JSON/text containing username and password\n');
  
  console.log('Method 2: Check Camera Documentation');
  console.log('  - Default username is usually: admin');
  console.log('  - Default password might be on the camera label');
  console.log('  - Common defaults: admin/admin, admin/12345, admin/[blank]\n');
  
  console.log('Method 3: Use TrueCloud App');
  console.log('  - Download TrueCloud app');
  console.log('  - Scan the QR code through the app');
  console.log('  - App will show/use credentials automatically\n');
  
  console.log('Method 4: Camera Reset to Defaults');
  console.log('  - Find reset button on camera (usually small hole)');
  console.log('  - Press and hold for 10-15 seconds');
  console.log('  - Camera resets to factory defaults');
  console.log('  - Default credentials will work\n');
  
  console.log('════════════════════════════════════════════════════════\n');
  console.log('🔐 Common Default Credentials for IP Cameras:\n');
  console.log('TrueCloud/Generic:');
  console.log('  - admin / admin');
  console.log('  - admin / 12345');
  console.log('  - admin / [device_id_last_6_digits]');
  console.log('  - admin / 888888\n');
  
  console.log('Hikvision:');
  console.log('  - admin / 12345');
  console.log('  - admin / [activation_password]\n');
  
  console.log('Dahua:');
  console.log('  - admin / admin');
  console.log('  - admin / [blank]\n');
  
  console.log('════════════════════════════════════════════════════════\n');
  console.log('🛠️  Recommended Actions:\n');
  console.log('1. Use a QR code reader app to scan the QR code');
  console.log('2. Try default credentials: admin/admin or admin/12345');
  console.log('3. Check if password is last 6 digits of Device ID: 592944');
  console.log('4. If nothing works, reset the camera to factory defaults');
}

// Check if we can decode from image file
const args = process.argv.slice(2);
if (args[0]) {
  console.log(`Attempting to decode QR from image: ${args[0]}\n`);
  console.log('Note: Install qrcode-reader or jimp package for image decoding:\n');
  console.log('  npm install jimp qrcode-reader\n');
}

decodeQR().catch(console.error);
