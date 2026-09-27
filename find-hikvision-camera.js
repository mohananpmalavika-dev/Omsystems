#!/usr/bin/env node

/**
 * Enhanced Hikvision Camera Finder
 * Specifically designed to find Hikvision cameras that might be missed by regular scans
 */

const dgram = require('dgram');
const net = require('net');
const http = require('http');
const https = require('https');

console.log('\n🔍 Hikvision Camera Discovery Tool');
console.log('====================================\n');

// Configuration - Scan multiple network ranges
const NETWORK_RANGES = [
  '192.168.1.0/24',
  '192.168.0.0/24',
  '10.0.0.0/24',
  '172.16.0.0/24',
];

// All possible Hikvision ports
const HIKVISION_PORTS = [
  80,      // HTTP Web Interface
  443,     // HTTPS
  554,     // RTSP Main Stream
  8000,    // Common Hikvision port
  8080,    // Alternative HTTP
  8443,    // Alternative HTTPS
  8554,    // Alternative RTSP
  65001,   // Hikvision SDK port
  65002,   // Hikvision SDK port
];

// Hikvision RTSP paths
const HIKVISION_RTSP_PATHS = [
  '/Streaming/Channels/101',  // Main stream
  '/Streaming/Channels/102',  // Sub stream
  '/Streaming/Channels/1',
  '/Streaming/Channels/2',
  '/h264/ch1/main/av_stream',
  '/h264/ch1/sub/av_stream',
  '/cam/realmonitor?channel=1&subtype=0',
  '/live',
  '/stream1',
];

// Hikvision SADP Discovery (proprietary protocol)
const SADP_PORT = 37020;
const SADP_MULTICAST = '239.255.255.250';

const discoveredCameras = new Map();

// Enhanced port check with retry
async function checkPort(ip, port, timeout = 2000, retries = 2) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const isOpen = await new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        cleanup();
        resolve(true);
      });

      socket.on('timeout', () => {
        cleanup();
        resolve(false);
      });

      socket.on('error', () => {
        cleanup();
        resolve(false);
      });

      socket.connect(port, ip);
    });

    if (isOpen) return true;
    
    // Wait before retry
    if (attempt < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return false;
}

// Check if it's a Hikvision camera
async function isHikvisionCamera(ip, port) {
  const scheme = port === 443 || port === 8443 ? 'https' : 'http';
  const url = `${scheme}://${ip}:${port}`;
  
  return new Promise((resolve) => {
    const client = scheme === 'https' ? https : http;
    
    const options = {
      method: 'GET',
      timeout: 3000,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    };

    const req = client.get(url, options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
        // Stop early if we find Hikvision signature
        if (data.toLowerCase().includes('hikvision')) {
          req.destroy();
        }
      });
      
      res.on('end', () => {
        const headers = JSON.stringify(res.headers).toLowerCase();
        const bodyLower = data.toLowerCase();
        
        const isHikvision = 
          headers.includes('hikvision') ||
          bodyLower.includes('hikvision') ||
          bodyLower.includes('dvr') ||
          bodyLower.includes('ipcamera') ||
          res.headers['server']?.toLowerCase().includes('app-webs');
        
        resolve(isHikvision);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

// Test Hikvision RTSP stream
async function testHikvisionRtsp(ip, port) {
  const workingPaths = [];
  
  for (const path of HIKVISION_RTSP_PATHS) {
    const works = await new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      socket.setTimeout(2000);
      
      socket.on('connect', () => {
        const request = `OPTIONS ${path} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: HikvisionFinder\r\n\r\n`;
        socket.write(request);
      });

      socket.on('data', (data) => {
        const response = data.toString();
        cleanup();
        resolve(response.includes('RTSP/1.0'));
      });

      socket.on('timeout', () => {
        cleanup();
        resolve(false);
      });

      socket.on('error', () => {
        cleanup();
        resolve(false);
      });

      socket.connect(port, ip);
    });

    if (works) {
      workingPaths.push(path);
    }
  }

  return workingPaths;
}

// Hikvision SADP Discovery
function sadpDiscovery() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Set();

    // Hikvision SADP probe packet (simplified)
    const SADP_PROBE = Buffer.from([
      0x21, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    socket.on('message', (msg, rinfo) => {
      const ip = rinfo.address;
      if (!found.has(ip)) {
        found.add(ip);
        console.log(`✅ [SADP] Found Hikvision device at ${ip}`);
      }
    });

    socket.on('error', (err) => {
      console.error('SADP Error:', err.message);
    });

    socket.bind(SADP_PORT, () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(128);
      
      try {
        socket.addMembership(SADP_MULTICAST);
        socket.send(SADP_PROBE, SADP_PORT, SADP_MULTICAST);
        console.log('📡 Sending Hikvision SADP discovery probe...\n');
      } catch (err) {
        console.log('⚠️  SADP multicast unavailable (this is OK)\n');
      }
    });

    setTimeout(() => {
      socket.close();
      resolve(Array.from(found));
    }, 5000);
  });
}

// Expand CIDR
function expandCIDR(cidr) {
  const [baseIP, bits] = cidr.split('/');
  const ipParts = baseIP.split('.').map(Number);
  const networkBits = parseInt(bits);
  const hostBits = 32 - networkBits;
  const numberOfHosts = Math.pow(2, hostBits) - 2;

  const ips = [];
  const baseValue = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];

  for (let i = 1; i <= numberOfHosts; i++) {
    const ipValue = (baseValue & (~0 << hostBits)) + i;
    const ip = [
      (ipValue >> 24) & 0xff,
      (ipValue >> 16) & 0xff,
      (ipValue >> 8) & 0xff,
      ipValue & 0xff,
    ].join('.');
    ips.push(ip);
  }

  return ips;
}

// Scan single IP for Hikvision
async function scanIPForHikvision(ip) {
  for (const port of HIKVISION_PORTS) {
    try {
      const isOpen = await checkPort(ip, port);
      
      if (isOpen) {
        // Check if it's really Hikvision
        const isHik = await isHikvisionCamera(ip, port);
        
        if (isHik) {
          const key = ip;
          
          if (!discoveredCameras.has(key)) {
            const camera = {
              ip,
              ports: [port],
              manufacturer: 'Hikvision',
              httpUrl: `http://${ip}:${port === 443 || port === 8443 ? port : (port === 80 ? '' : port)}`,
              rtspUrls: [],
            };

            // Test RTSP if port is 554 or 8554
            if (port === 554 || port === 8554) {
              const rtspPaths = await testHikvisionRtsp(ip, port);
              camera.rtspUrls = rtspPaths.map(path => `rtsp://${ip}:${port}${path}`);
            }

            discoveredCameras.set(key, camera);
            console.log(`✅ Found Hikvision Camera: ${ip}:${port}`);
            
            if (camera.rtspUrls.length > 0) {
              console.log(`   📹 RTSP Streams: ${camera.rtspUrls.length} available`);
            }
          } else {
            discoveredCameras.get(key).ports.push(port);
          }
        }
      }
    } catch (error) {
      // Ignore errors and continue
    }
  }
}

// Main scan
async function findHikvisionCameras() {
  const startTime = Date.now();

  // Phase 1: SADP Discovery (Hikvision proprietary)
  console.log('🔍 Phase 1: Hikvision SADP Discovery\n');
  const sadpDevices = await sadpDiscovery();
  
  // Phase 2: Deep network scan
  console.log('🔍 Phase 2: Deep Network Scan\n');
  
  for (const range of NETWORK_RANGES) {
    console.log(`📡 Scanning ${range}...`);
    const ips = expandCIDR(range);
    
    // Scan in small batches to be thorough
    const batchSize = 5;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      await Promise.all(batch.map(ip => scanIPForHikvision(ip)));
      
      const progress = Math.round(((i + batchSize) / ips.length) * 100);
      process.stdout.write(`\r   Progress: ${progress}%`);
    }
    console.log('\n');
  }

  // Results
  console.log('====================================');
  console.log('📊 SCAN COMPLETE');
  console.log('====================================\n');

  const cameras = Array.from(discoveredCameras.values());
  
  if (cameras.length === 0) {
    console.log('❌ No Hikvision cameras found.\n');
    console.log('💡 Troubleshooting Tips:');
    console.log('   1. Check if camera is powered on and connected');
    console.log('   2. Try running with sudo/administrator:');
    console.log('      sudo node find-hikvision-camera.js');
    console.log('   3. Check camera IP settings using Hikvision SADP tool');
    console.log('   4. Verify camera is on same network subnet');
    console.log('   5. Check if firewall is blocking ports');
    console.log('   6. Try direct camera IP: node test-camera-ip.js <IP>\n');
  } else {
    console.log(`✅ Found ${cameras.length} Hikvision camera(s):\n`);
    
    cameras.forEach((camera, index) => {
      console.log(`${index + 1}. 📹 ${camera.ip}`);
      console.log(`   Manufacturer: ${camera.manufacturer}`);
      console.log(`   Ports: ${camera.ports.join(', ')}`);
      console.log(`   Web Interface: ${camera.httpUrl}`);
      
      if (camera.rtspUrls.length > 0) {
        console.log(`   RTSP Streams:`);
        camera.rtspUrls.forEach(url => {
          console.log(`     - ${url}`);
        });
      }
      console.log('');
    });

    // Save results
    const fs = require('fs');
    fs.writeFileSync('hikvision-cameras.json', JSON.stringify(cameras, null, 2));
    console.log('💾 Results saved to: hikvision-cameras.json\n');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`⏱️  Scan duration: ${duration} seconds\n`);
}

// Run
findHikvisionCameras().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
