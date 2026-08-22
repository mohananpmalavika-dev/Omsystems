#!/usr/bin/env node
/**
 * Extract Camera Credentials from QR Code Image
 * 
 * Usage:
 *   npm install jimp qrcode-reader
 *   node scripts/extract-camera-credentials.mjs <path-to-qr-image>
 */

import { createRequire } from 'module';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

async function extractCredentials(imagePath) {
  console.log('🔍 Camera QR Code Credential Extractor\n');
  
  if (!imagePath || !existsSync(imagePath)) {
    console.log('❌ Please provide a valid path to the QR code image\n');
    console.log('Usage: node scripts/extract-camera-credentials.mjs <image-path>\n');
    showManualMethods();
    return;
  }

  console.log(`📷 Reading image: ${imagePath}\n`);

  try {
    // Try to load required packages
    let Jimp, QrCode;
    try {
      Jimp = require('jimp');
      QrCode = require('qrcode-reader');
    } catch (error) {
      console.log('⚠️  Required packages not installed\n');
      console.log('Install them with:\n');
      console.log('  npm install jimp qrcode-reader\n');
      console.log('Or:\n');
      console.log('  cd scripts && npm init -y && npm install jimp qrcode-reader\n');
      showManualMethods();
      return;
    }

    // Read and decode the QR code
    const image = await Jimp.read(imagePath);
    const qr = new QrCode();

    const decoded = await new Promise((resolve, reject) => {
      qr.callback = (err, value) => {
        if (err) reject(err);
        else resolve(value);
      };
      qr.decode(image.bitmap);
    });

    console.log('✅ QR Code Decoded Successfully!\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Raw QR Data:');
    console.log(decoded.result);
    console.log('\n═══════════════════════════════════════════════════════\n');

    // Try to parse the data
    parseCredentials(decoded.result);

  } catch (error) {
    console.log(`❌ Error decoding QR code: ${error.message}\n`);
    showManualMethods();
  }
}

function parseCredentials(data) {
  console.log('🔐 Extracted Credentials:\n');

  try {
    // Try JSON format
    const json = JSON.parse(data);
    console.log('Format: JSON\n');
    if (json.id) console.log(`Device ID: ${json.id}`);
    if (json.user || json.username) console.log(`Username: ${json.user || json.username}`);
    if (json.pwd || json.password) console.log(`Password: ${json.pwd || json.password}`);
    if (json.ip) console.log(`IP Address: ${json.ip}`);
    if (json.mac) console.log(`MAC Address: ${json.mac}`);
    if (json.port) console.log(`Port: ${json.port}`);
    console.log('\n');
    return;
  } catch (e) {
    // Not JSON
  }

  // Try key-value format (ID:xxx;USER:xxx;PWD:xxx)
  if (data.includes(';') && data.includes(':')) {
    console.log('Format: Key-Value Pairs\n');
    const pairs = data.split(';');
    pairs.forEach(pair => {
      const [key, value] = pair.split(':');
      if (key && value) {
        console.log(`${key.trim()}: ${value.trim()}`);
      }
    });
    console.log('\n');
    return;
  }

  // Try URL format
  if (data.startsWith('http') || data.includes('://')) {
    console.log('Format: URL\n');
    try {
      const url = new URL(data);
      console.log(`Protocol: ${url.protocol}`);
      console.log(`Host: ${url.hostname}`);
      if (url.port) console.log(`Port: ${url.port}`);
      
      console.log('\nQuery Parameters:');
      url.searchParams.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });
      console.log('\n');
      return;
    } catch (e) {
      // Not a valid URL
    }
  }

  // Try comma-separated format
  if (data.includes(',')) {
    console.log('Format: Comma-Separated\n');
    const parts = data.split(',');
    console.log(`Device ID: ${parts[0] || 'N/A'}`);
    console.log(`Username: ${parts[1] || 'N/A'}`);
    console.log(`Password: ${parts[2] || 'N/A'}`);
    console.log(`IP Address: ${parts[3] || 'N/A'}`);
    console.log('\n');
    return;
  }

  // If we can't parse it, just show the raw data
  console.log('Format: Unknown\n');
  console.log('Could not automatically parse credentials.');
  console.log('Please check the raw data above.\n');
}

function showManualMethods() {
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📱 Manual Methods to Extract Credentials:\n');
  
  console.log('1️⃣  Use Online QR Code Reader:');
  console.log('   - Visit: https://webqr.com');
  console.log('   - Upload your QR code image');
  console.log('   - View the decoded text\n');
  
  console.log('2️⃣  Use Mobile QR Scanner App:');
  console.log('   - Install any QR code scanner on your phone');
  console.log('   - Scan the QR code directly from camera');
  console.log('   - Look for credential information\n');
  
  console.log('3️⃣  Try Default Credentials:');
  console.log('   Device ID: 4835592944');
  console.log('   Username: admin');
  console.log('   Password possibilities:');
  console.log('     - admin');
  console.log('     - 12345');
  console.log('     - 592944 (last 6 digits of device ID)');
  console.log('     - 888888');
  console.log('     - [blank/empty]\n');
  
  console.log('4️⃣  Reset Camera to Factory Defaults:');
  console.log('   - Locate reset button (usually small hole)');
  console.log('   - Press and hold for 10-15 seconds');
  console.log('   - Camera will reset to default credentials');
  console.log('   - Usually: admin/admin or admin/12345\n');
  
  console.log('5️⃣  Contact Manufacturer:');
  console.log('   - TrueCloud support');
  console.log('   - Provide Device ID: 4835592944');
  console.log('   - They can help reset or provide credentials\n');
}

// Run the script
const imagePath = process.argv[2];
extractCredentials(imagePath).catch(console.error);
