#!/usr/bin/env node

/**
 * Quick Camera Details Scanner
 * Scans specific IPs found from ONVIF discovery
 */

const net = require('net');
const http = require('http');
const https = require('https');

// Cameras found from ONVIF discovery
const CAMERA_IPS = [
  '192.168.29.45',
  '192.168.29.171',
  '192.168.29.195',
];

const COMMON_PORTS = [80, 443, 554, 8000, 8080, 8554];
const TIMEOUT = 3000;

const RTSP_PATHS = [
  '/stream1',
  '/live',
  '/cam/realmonitor',
  '/Streaming/Channels/101',
  '/Streaming/Channels/1',
  '/h264',
  '/onvif1',
];

const discoveredCameras = [];

console.log('\n🎯 Quick Camera Details Scanner');
console.log('================================\n');
console.log(`📹 Scanning ${CAMERA_IPS.length} discovered cameras...\n`);

function checkPort(ip, port, timeout) {
  return new Promise((resolve) => {
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
}

function testRtspUrl(ip, port, path, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
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

function httpRequest(url, timeout) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 500),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.on('error', reject);
  });
}

function identifyManufacturer(headers, body) {
  const serverHeader = (headers['server'] || '').toLowerCase();
  const wwwAuth = (headers['www-authenticate'] || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();

  if (serverHeader.includes('hikvision') || bodyLower.includes('hikvision')) {
    return 'Hikvision';
  } else if (serverHeader.includes('dahua') || bodyLower.includes('dahua')) {
    return 'Dahua';
  } else if (wwwAuth.includes('axis') || bodyLower.includes('axis')) {
    return 'Axis';
  } else if (serverHeader.includes('vivotek') || bodyLower.includes('vivotek')) {
    return 'Vivotek';
  } else if (bodyLower.includes('foscam')) {
    return 'Foscam';
  } else if (bodyLower.includes('tp-link')) {
    return 'TP-Link';
  }
  
  return 'Unknown';
}

async function scanCamera(ip) {
  console.log(`\n🔍 Scanning ${ip}...`);
  
  const camera = {
    ip,
    ports: [],
    manufacturer: 'Unknown',
    rtspUrls: [],
    httpUrls: [],
    onvif: true,
  };

  for (const port of COMMON_PORTS) {
    const isOpen = await checkPort(ip, port, TIMEOUT);
    
    if (isOpen) {
      camera.ports.push(port);
      console.log(`  ✅ Port ${port} open`);

      // Check RTSP
      if (port === 554 || port === 8554) {
        for (const path of RTSP_PATHS) {
          const isRtsp = await testRtspUrl(ip, port, path, TIMEOUT);
          if (isRtsp) {
            const rtspUrl = `rtsp://${ip}:${port}${path}`;
            camera.rtspUrls.push(rtspUrl);
            console.log(`  📹 RTSP: ${rtspUrl}`);
            break;
          }
        }
      }

      // Check HTTP
      if (port === 80 || port === 443 || port === 8000 || port === 8080) {
        const scheme = port === 443 ? 'https' : 'http';
        const url = `${scheme}://${ip}:${port}`;
        
        try {
          const response = await httpRequest(url, TIMEOUT);
          camera.httpUrls.push(url);
          camera.manufacturer = identifyManufacturer(response.headers, response.body);
          console.log(`  🌐 HTTP: ${url} [${camera.manufacturer}]`);
        } catch (error) {
          // HTTP not accessible
        }
      }
    }
  }

  discoveredCameras.push(camera);
}

async function startQuickScan() {
  const startTime = Date.now();

  for (const ip of CAMERA_IPS) {
    await scanCamera(ip);
  }

  console.log('\n\n================================');
  console.log('📊 SCAN RESULTS');
  console.log('================================\n');

  console.log(`✅ Scanned ${discoveredCameras.length} camera(s):\n`);
  
  discoveredCameras.forEach((camera, index) => {
    console.log(`\n📹 Camera ${index + 1}: ${camera.ip}`);
    console.log(`   Manufacturer: ${camera.manufacturer}`);
    console.log(`   Open Ports: ${camera.ports.join(', ')}`);
    console.log(`   ONVIF: ${camera.onvif ? 'Yes' : 'No'}`);
    
    if (camera.rtspUrls.length > 0) {
      console.log(`   RTSP URLs:`);
      camera.rtspUrls.forEach(url => console.log(`     - ${url}`));
    }
    
    if (camera.httpUrls.length > 0) {
      console.log(`   HTTP URLs:`);
      camera.httpUrls.forEach(url => console.log(`     - ${url}`));
    }
  });

  // Save results
  const fs = require('fs');
  fs.writeFileSync('discovered-cameras.json', JSON.stringify(discoveredCameras, null, 2));
  console.log(`\n\n💾 Results saved to: discovered-cameras.json`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`⏱️  Scan duration: ${duration} seconds\n`);
}

startQuickScan().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
