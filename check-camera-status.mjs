#!/usr/bin/env node
/**
 * Check status of known cameras on 192.168.29.x network
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execAsync = promisify(exec);

const KNOWN_CAMERAS = [
  { ip: '192.168.29.196', port: 8888, name: 'Camera 1' },
  { ip: '192.168.29.46', port: 8888, name: 'Camera 2' },
  { ip: '192.168.29.58', port: 8899, name: 'Camera 3' },
  { ip: '192.168.29.171', port: 80, name: 'DVR/Camera 4' },
];

console.log('\n🎥 CHECKING CAMERA CONNECTIVITY\n');
console.log('═'.repeat(80));

// Test HTTP connectivity
function testHttp(ip, port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: ip,
        port: port,
        path: '/onvif/device_service',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        resolve({ reachable: true, status: res.statusCode });
      }
    );
    
    req.on('error', () => resolve({ reachable: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false });
    });
    
    req.end();
  });
}

// Test ping
async function testPing(ip) {
  try {
    const { stdout } = await execAsync(`ping -n 1 -w 1000 ${ip}`, { timeout: 2000 });
    return stdout.includes('Reply from') || stdout.includes('TTL=');
  } catch {
    return false;
  }
}

async function checkCameras() {
  console.log('\n📡 Testing connectivity to known cameras...\n');
  
  for (const camera of KNOWN_CAMERAS) {
    console.log(`\n${camera.name}: ${camera.ip}:${camera.port}`);
    console.log('─'.repeat(40));
    
    // Test ping
    const pingResult = await testPing(camera.ip);
    console.log(`  Ping: ${pingResult ? '✓ Reachable' : '✗ No response'}`);
    
    if (pingResult) {
      // Test HTTP/ONVIF
      const httpResult = await testHttp(camera.ip, camera.port);
      console.log(`  HTTP ${camera.port}: ${httpResult.reachable ? '✓ Open' : '✗ Closed'}`);
      if (httpResult.reachable && httpResult.status) {
        console.log(`  Status Code: ${httpResult.status}`);
      }
      
      // Try RTSP port 554
      try {
        const { stdout } = await execAsync(
          `powershell -Command "Test-NetConnection -ComputerName ${camera.ip} -Port 554 -InformationLevel Quiet -WarningAction SilentlyContinue"`,
          { timeout: 2000 }
        );
        const rtspOpen = stdout.trim() === 'True';
        console.log(`  RTSP 554: ${rtspOpen ? '✓ Open' : '✗ Closed'}`);
      } catch {
        console.log(`  RTSP 554: ✗ Closed`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('\n✅ Connectivity check complete\n');
}

checkCameras().catch(error => {
  console.error('\n❌ Error:', error.message);
});
