#!/usr/bin/env node
/**
 * Network Camera Scanner
 * Scans local network for IP cameras using multiple methods:
 * - ONVIF WS-Discovery
 * - Port scanning (RTSP 554, HTTP 80, ONVIF 8000, 8080)
 * - ARP table inspection
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dgram from 'dgram';

const execAsync = promisify(exec);

console.log('\n🔍 NETWORK CAMERA SCANNER\n');
console.log('═'.repeat(80));

// Get local network information
async function getLocalNetwork() {
  try {
    const { stdout } = await execAsync('ipconfig');
    const lines = stdout.split('\n');
    
    let ipv4 = null;
    let subnet = null;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('IPv4 Address')) {
        const match = lines[i].match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match) ipv4 = match[1];
      }
      if (lines[i].includes('Subnet Mask')) {
        const match = lines[i].match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match) subnet = match[1];
      }
    }
    
    if (ipv4) {
      const parts = ipv4.split('.');
      const networkBase = `${parts[0]}.${parts[1]}.${parts[2]}`;
      return { ipv4, subnet, networkBase };
    }
  } catch (error) {
    console.error('Could not detect network:', error.message);
  }
  return null;
}

// ONVIF WS-Discovery
async function onvifDiscovery() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const devices = [];
    
    const MULTICAST_ADDR = '239.255.255.250';
    const MULTICAST_PORT = 3702;
    
    const probeMessage = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>uuid:${crypto.randomUUID()}</a:MessageID>
    <a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <d:Types xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" 
               xmlns:dp0="http://www.onvif.org/ver10/network/wsdl">dp0:NetworkVideoTransmitter</d:Types>
    </Probe>
  </s:Body>
</s:Envelope>`;

    socket.on('message', (msg, rinfo) => {
      const response = msg.toString();
      if (response.includes('ProbeMatches')) {
        // Extract XAddrs (camera endpoint)
        const xaddrsMatch = response.match(/<.*?XAddrs.*?>(.*?)<\/.*?XAddrs>/);
        if (xaddrsMatch) {
          devices.push({
            ip: rinfo.address,
            port: rinfo.port,
            endpoint: xaddrsMatch[1],
            type: 'ONVIF',
            raw: response
          });
        }
      }
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(128);
      socket.addMembership(MULTICAST_ADDR);
      
      // Send discovery probe
      socket.send(probeMessage, MULTICAST_PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error('ONVIF discovery error:', err);
      });
    });

    // Wait 5 seconds for responses
    setTimeout(() => {
      socket.close();
      resolve(devices);
    }, 5000);
  });
}

// ARP table scan to find active devices
async function arpScan() {
  try {
    const { stdout } = await execAsync('arp -a');
    const lines = stdout.split('\n');
    const devices = [];
    
    for (const line of lines) {
      const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]+)/);
      if (match) {
        devices.push({
          ip: match[1],
          mac: match[2],
          type: 'ARP'
        });
      }
    }
    
    return devices;
  } catch (error) {
    console.error('ARP scan error:', error.message);
    return [];
  }
}

// Port scan for common camera ports
async function portScan(ip, ports = [80, 554, 8000, 8080, 8081]) {
  const openPorts = [];
  
  for (const port of ports) {
    try {
      // Use Test-NetConnection on Windows
      const { stdout } = await execAsync(
        `powershell -Command "Test-NetConnection -ComputerName ${ip} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`,
        { timeout: 2000 }
      );
      
      if (stdout.trim() === 'True') {
        openPorts.push(port);
      }
    } catch (error) {
      // Timeout or connection refused
    }
  }
  
  return openPorts;
}

// Main scanner
async function scanNetwork() {
  console.log('\n📡 Step 1: Detecting local network...\n');
  const network = await getLocalNetwork();
  
  if (!network) {
    console.log('❌ Could not detect network configuration');
    return;
  }
  
  console.log(`✓ Local IP: ${network.ipv4}`);
  console.log(`✓ Subnet: ${network.subnet}`);
  console.log(`✓ Network: ${network.networkBase}.0/24\n`);
  
  console.log('📡 Step 2: Running ONVIF discovery (5 seconds)...\n');
  const onvifDevices = await onvifDiscovery();
  
  console.log(`✓ Found ${onvifDevices.length} ONVIF device(s)\n`);
  
  onvifDevices.forEach((device, idx) => {
    console.log(`${idx + 1}. ${device.ip}`);
    console.log(`   Protocol: ONVIF`);
    console.log(`   Endpoint: ${device.endpoint}`);
  });
  
  console.log('\n📡 Step 3: Scanning ARP table for active devices...\n');
  const arpDevices = await arpScan();
  
  console.log(`✓ Found ${arpDevices.length} active device(s)\n`);
  
  // Filter to likely camera IPs (192.168.x.x range, not router/gateway)
  const cameraCandidates = arpDevices.filter(d => {
    const ip = d.ip;
    const parts = ip.split('.');
    const lastOctet = parseInt(parts[3]);
    // Skip .1 (router), .255 (broadcast), own IP
    return ip.startsWith(network.networkBase) && 
           lastOctet > 1 && 
           lastOctet < 255 && 
           ip !== network.ipv4;
  });
  
  console.log(`📡 Step 4: Checking camera ports on ${cameraCandidates.length} candidate(s)...\n`);
  
  const cameraDevices = [];
  
  for (const device of cameraCandidates.slice(0, 20)) { // Limit to 20 to avoid long scan
    console.log(`Scanning ${device.ip}...`);
    const openPorts = await portScan(device.ip);
    
    if (openPorts.length > 0) {
      const hasRtsp = openPorts.includes(554);
      const hasHttp = openPorts.includes(80) || openPorts.includes(8080);
      const hasOnvif = openPorts.includes(8000);
      
      const likelyCamera = hasRtsp || (hasHttp && hasOnvif);
      
      if (likelyCamera) {
        cameraDevices.push({
          ...device,
          openPorts,
          hasRtsp,
          hasHttp,
          hasOnvif,
          confidence: hasRtsp && hasOnvif ? 'HIGH' : hasRtsp ? 'MEDIUM' : 'LOW'
        });
      }
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 SCAN RESULTS\n');
  console.log(`Total ONVIF devices: ${onvifDevices.length}`);
  console.log(`Total likely cameras: ${cameraDevices.length}\n`);
  
  if (cameraDevices.length > 0) {
    console.log('🎥 DETECTED CAMERAS:\n');
    cameraDevices.forEach((device, idx) => {
      console.log(`${idx + 1}. IP: ${device.ip}`);
      console.log(`   MAC: ${device.mac}`);
      console.log(`   Open Ports: ${device.openPorts.join(', ')}`);
      console.log(`   RTSP: ${device.hasRtsp ? '✓' : '✗'}`);
      console.log(`   HTTP: ${device.hasHttp ? '✓' : '✗'}`);
      console.log(`   ONVIF: ${device.hasOnvif ? '✓' : '✗'}`);
      console.log(`   Confidence: ${device.confidence}`);
      console.log('');
    });
  } else {
    console.log('❌ No cameras detected on network\n');
    console.log('Possible reasons:');
    console.log('- Cameras are on a different subnet');
    console.log('- Firewall is blocking discovery');
    console.log('- Cameras are using non-standard ports');
    console.log('- Network is isolated/segmented\n');
  }
  
  console.log('═'.repeat(80));
  console.log('\n✅ Scan complete\n');
}

scanNetwork().catch(error => {
  console.error('\n❌ Scanner error:', error.message);
  console.error(error.stack);
});
