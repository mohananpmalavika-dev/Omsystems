#!/usr/bin/env node
/**
 * Test QR Code Decoding
 * This script attempts to decode a QR code image
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 TrueCloud Camera QR Code Decoder Test\n');
console.log('Device ID: 4835592944');
console.log('Valid until: 2026/08/14 20:34:08\n');

// Check if image file exists
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('❌ Please provide the path to your QR code image\n');
  console.log('Usage: node test-qr-decode.mjs <path-to-qr-image>\n');
  console.log('Example: node test-qr-decode.mjs qr-code.jpg\n');
  
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📋 Alternative Methods to Decode Your QR Code:\n');
  
  console.log('1️⃣  Online QR Reader (FASTEST):');
  console.log('   • Visit: https://webqr.com');
  console.log('   • Click "Upload" and select your QR code image');
  console.log('   • View the decoded text\n');
  
  console.log('2️⃣  Mobile QR Scanner:');
  console.log('   • Use any QR scanner app on your phone');
  console.log('   • Scan the QR code from the camera label');
  console.log('   • Look for username and password in decoded text\n');
  
  console.log('3️⃣  Try Default Credentials:');
  console.log('   Username: admin');
  console.log('   Password options:');
  console.log('     • admin');
  console.log('     • 12345');
  console.log('     • 592944 (last 6 digits of device ID)');
  console.log('     • 888888\n');
  
  console.log('4️⃣  Use Our Dashboard Feature:');
  console.log('   • Save your QR code image');
  console.log('   • Go to: http://localhost:3000/admin/branch-onboarding');
  console.log('   • Click "Scan cameras"');
  console.log('   • Click "Enter login & password"');
  console.log('   • Click "Scan or Upload QR Code"');
  console.log('   • Upload your saved QR image');
  console.log('   • Credentials will auto-fill!\n');
  
  process.exit(0);
}

if (!existsSync(imagePath)) {
  console.log(`❌ File not found: ${imagePath}\n`);
  console.log('Please provide a valid path to your QR code image.\n');
  process.exit(1);
}

console.log(`📷 Reading image: ${imagePath}\n`);

// Try to load and decode
try {
  const require = createRequire(import.meta.url);
  
  // Try to load jimp and qrcode-reader
  let Jimp, QrCode;
  try {
    Jimp = require('jimp');
    QrCode = require('qrcode-reader');
  } catch (error) {
    console.log('⚠️  Required packages not installed\n');
    console.log('Install them with:');
    console.log('  npm install jimp qrcode-reader\n');
    console.log('Or use the online decoder: https://webqr.com\n');
    process.exit(1);
  }

  console.log('📖 Decoding QR code...\n');

  Jimp.read(imagePath).then(image => {
    const qr = new QrCode();

    qr.callback = (err, value) => {
      if (err) {
        console.log('❌ Error decoding QR code:', err.message);
        console.log('\nTry using: https://webqr.com\n');
        process.exit(1);
      }

      console.log('✅ QR Code Decoded Successfully!\n');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Raw QR Data:');
      console.log(value.result);
      console.log('\n═══════════════════════════════════════════════════════\n');

      // Try to parse credentials
      parseCredentials(value.result);
    };

    qr.decode(image.bitmap);
  }).catch(error => {
    console.log('❌ Error reading image:', error.message);
    console.log('\nMake sure the file is a valid image (JPEG, PNG, etc.)\n');
    process.exit(1);
  });

} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('\nTry using: https://webqr.com\n');
  process.exit(1);
}

function parseCredentials(data) {
  console.log('🔐 Extracted Credentials:\n');

  let username = null;
  let password = null;

  // Try JSON format
  try {
    const json = JSON.parse(data);
    username = json.user || json.username || json.USER || json.USERNAME;
    password = json.pwd || json.password || json.PWD || json.PASSWORD;
    
    if (username || password) {
      console.log('Format: JSON\n');
      if (username) console.log(`Username: ${username}`);
      if (password) console.log(`Password: ${password}`);
      if (json.ip) console.log(`IP Address: ${json.ip}`);
      if (json.mac) console.log(`MAC Address: ${json.mac}`);
      console.log('\n');
      return;
    }
  } catch (e) {
    // Not JSON
  }

  // Try key-value format
  if (data.includes(';') && data.includes(':')) {
    console.log('Format: Key-Value Pairs\n');
    const pairs = data.split(';');
    pairs.forEach(pair => {
      const [key, value] = pair.split(':');
      if (key && value) {
        const upperKey = key.trim().toUpperCase();
        console.log(`${key.trim()}: ${value.trim()}`);
        
        if (upperKey === 'USER' || upperKey === 'USERNAME') {
          username = value.trim();
        } else if (upperKey === 'PWD' || upperKey === 'PASSWORD' || upperKey === 'PASS') {
          password = value.trim();
        }
      }
    });
    console.log('\n');
    if (username || password) return;
  }

  // Try URL format
  if (data.startsWith('http') || data.includes('://')) {
    console.log('Format: URL\n');
    try {
      const url = new URL(data);
      username = url.searchParams.get('user') || url.searchParams.get('username');
      password = url.searchParams.get('pwd') || url.searchParams.get('password');
      
      console.log(`Protocol: ${url.protocol}`);
      console.log(`Host: ${url.hostname}`);
      if (url.port) console.log(`Port: ${url.port}`);
      console.log('\nQuery Parameters:');
      url.searchParams.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });
      console.log('\n');
      if (username || password) return;
    } catch (e) {
      // Not a valid URL
    }
  }

  // Try comma-separated
  if (data.includes(',')) {
    console.log('Format: Comma-Separated\n');
    const parts = data.split(',');
    console.log(`Device ID: ${parts[0] || 'N/A'}`);
    console.log(`Username: ${parts[1] || 'N/A'}`);
    console.log(`Password: ${parts[2] || 'N/A'}`);
    if (parts[3]) console.log(`IP Address: ${parts[3]}`);
    console.log('\n');
    if (parts[1] || parts[2]) return;
  }

  // If we couldn't parse credentials
  if (!username && !password) {
    console.log('Format: Unknown or No Credentials in QR\n');
    console.log('The QR code might only contain device information (ID, IP, etc.)');
    console.log('and not include the actual username/password.\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔑 Try These Default Credentials:\n');
    console.log('Username: admin');
    console.log('Password options:');
    console.log('  • admin');
    console.log('  • 12345');
    console.log('  • 592944 (last 6 digits of your device ID)');
    console.log('  • 888888\n');
  } else {
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('✅ Success! Use these credentials in your dashboard:\n');
    if (username) console.log(`Username: ${username}`);
    if (password) console.log(`Password: ${password}`);
    console.log('\n');
  }
}
