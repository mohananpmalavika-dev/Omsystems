#!/usr/bin/env node

/**
 * Test specific camera IP
 * Usage: node test-camera-ip.js 192.168.1.64
 */

const net = require('net');
const http = require('http');
const https = require('https');

const cameraIP = process.argv[2];

if (!cameraIP) {
  console.log('\n❌ Please provide camera IP address');
  console.log('Usage: node test-camera-ip.js <IP_ADDRESS>');
  console.log('Example: node test-camera-ip.js 192.168.1.64\n');
  process.exit(1);
}

console.log(`\n🔍 Testing Camera: ${cameraIP}`);
console.log('====================================\n');

const ALL_PORTS = [80, 443, 554, 8000, 8080, 8443, 8554, 65001, 65002, 37777, 34567];

const RTSP_PATHS = [
  '/Streaming/Channels/101',
  '/Streaming/Channels/102',
  '/Streaming/Channels/1',
  '/h264/ch1/main/av_stream',
  '/cam/realmonitor?channel=1&subtype=0',
  '/live',
  '/stream1',
];

async function testPort(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(3000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

async function testHttp(ip, port) {
  const scheme = (port === 443 || port === 8443) ? 'https' : 'http';
  const url = `${scheme}://${ip}:${port}`;
  
  return new Promise((resolve) => {
    const client = scheme === 'https' ? https : http;
    
    const req = client.get(url, { 
      timeout: 3000,
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 500),
        });
      });
    });
    
    req.on('error', () => resolve({ success: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false });
    });
  });
}

async function testRtsp(ip, port, path) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(3000);
    socket.on('connect', () => {
      const request = `OPTIONS ${path} RTSP/1.0\r\nCSeq: 1\r\n\r\n`;
      socket.write(request);
    });
    socket.on('data', (data) => {
      socket.destroy();
      resolve(data.toString().includes('RTSP/1.0'));
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

async function runTests() {
  console.log('🔌 Testing Ports...\n');
  
  const openPorts = [];
  
  for (const port of ALL_PORTS) {
    const isOpen = await testPort(cameraIP, port);
    if (isOpen) {
      openPorts.push(port);
      console.log(`✅ Port ${port} is OPEN`);
    } else {
      console.log(`❌ Port ${port} is closed`);
    }
  }
  
  if (openPorts.length === 0) {
    console.log('\n❌ No ports are accessible!');
    console.log('\n💡 Check:');
    console.log('   - Camera is powered on');
    console.log('   - Camera IP is correct');
    console.log('   - You are on the same network');
    console.log('   - Firewall settings\n');
    return;
  }
  
  console.log(`\n✅ Found ${openPorts.length} open port(s)\n`);
  
  // Test HTTP/HTTPS
  console.log('🌐 Testing HTTP/HTTPS...\n');
  for (const port of openPorts) {
    if ([80, 443, 8000, 8080, 8443].includes(port)) {
      const result = await testHttp(cameraIP, port);
      if (result.success) {
        const scheme = (port === 443 || port === 8443) ? 'https' : 'http';
        console.log(`✅ HTTP accessible on port ${port}`);
        console.log(`   URL: ${scheme}://${cameraIP}:${port}`);
        console.log(`   Status: ${result.statusCode}`);
        
        const bodyLower = result.body?.toLowerCase() || '';
        if (bodyLower.includes('hikvision')) {
          console.log(`   🎯 HIKVISION DETECTED!`);
        }
        console.log('');
      }
    }
  }
  
  // Test RTSP
  console.log('📹 Testing RTSP Streams...\n');
  for (const port of openPorts) {
    if ([554, 8554].includes(port)) {
      console.log(`Testing RTSP on port ${port}...`);
      for (const path of RTSP_PATHS) {
        const works = await testRtsp(cameraIP, port, path);
        if (works) {
          console.log(`✅ rtsp://${cameraIP}:${port}${path}`);
        }
      }
      console.log('');
    }
  }
  
  console.log('====================================');
  console.log('Test Complete!\n');
}

runTests().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
