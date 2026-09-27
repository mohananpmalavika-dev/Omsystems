import net from 'node:net';
import dgram from 'node:dgram';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const execAsync = promisify(exec);

console.log('🔄 REFRESHING CAMERA SCAN ON NETWORK 192.168.29.0/24...\n');

// 1. Send Hikvision SADP Probe (UDP 37020)
const sadpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const sadpFound = [];
const SADP_PROBE = Buffer.from([
  0x21, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

sadpSocket.on('message', (msg, rinfo) => {
  if (rinfo.address !== '192.168.29.101') {
    sadpFound.push({ ip: rinfo.address, port: rinfo.port, raw: msg.toString('utf8').slice(0, 100) });
  }
});

// 2. Send ONVIF WS-Discovery Probe (UDP 3702)
const onvifSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const onvifFound = [];
const ONVIF_PROBE = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action><a:MessageID>uuid:' +
    crypto.randomUUID() +
    '</a:MessageID><a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To></s:Header><s:Body><Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery"><d:Types xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dp0="http://www.onvif.org/ver10/network/wsdl">dp0:NetworkVideoTransmitter dp0:NetworkVideoStorage</d:Types></Probe></s:Body></s:Envelope>',
  'utf8'
);

onvifSocket.on('message', (msg, rinfo) => {
  const text = msg.toString('utf8');
  if (text.includes('ProbeMatches')) {
    const xaddr = (text.match(/<.*?XAddrs.*?>(.*?)<\/.*?XAddrs>/i) || [])[1];
    onvifFound.push({ ip: rinfo.address, port: rinfo.port, xaddr });
  }
});

sadpSocket.bind(() => {
  try {
    sadpSocket.setBroadcast(true);
    sadpSocket.send(SADP_PROBE, 37020, '239.255.255.250');
    sadpSocket.send(SADP_PROBE, 37020, '255.255.255.255');
  } catch {}
});

onvifSocket.bind(() => {
  try {
    onvifSocket.setBroadcast(true);
    onvifSocket.send(ONVIF_PROBE, 3702, '239.255.255.250');
    onvifSocket.send(ONVIF_PROBE, 3702, '255.255.255.255');
    onvifSocket.send(ONVIF_PROBE, 3702, '192.168.29.255');
  } catch {}
});

const checkPort = (ip, port, timeout = 1000) =>
  new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeout);
    s.once('connect', () => {
      s.destroy();
      resolve(port);
    });
    s.once('timeout', () => {
      s.destroy();
      resolve(null);
    });
    s.once('error', () => {
      s.destroy();
      resolve(null);
    });
    s.connect(port, ip);
  });

async function main() {
  await new Promise((r) => setTimeout(r, 3500));
  try { sadpSocket.close(); } catch {}
  try { onvifSocket.close(); } catch {}

  const { stdout: arpOut } = await execAsync('arp -a');
  const arpIps = new Set();
  const lines = arpOut.split('\n');
  const macMap = new Map();
  for (const l of lines) {
    const m = l.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]+)/);
    if (m && m[1].startsWith('192.168.29.') && !m[1].endsWith('.255') && !m[1].endsWith('.1')) {
      arpIps.add(m[1]);
      macMap.set(m[1], m[2]);
    }
  }

  for (const d of onvifFound) arpIps.add(d.ip);
  for (const d of sadpFound) arpIps.add(d.ip);

  // Common Hikvision default IPs
  arpIps.add('192.168.1.64');
  arpIps.add('192.168.0.64');

  const candidateIps = [...arpIps].filter((ip) => ip !== '192.168.29.101');

  console.log(`Discovered ${candidateIps.length} candidate host(s) on local subnet:\n${candidateIps.join(', ')}\n`);

  const CAMERA_PORTS = [554, 80, 8000, 8080, 37777, 34567, 443, 8888, 8554, 9527, 8443, 65001];

  const results = [];

  for (const ip of candidateIps) {
    const portChecks = await Promise.all(CAMERA_PORTS.map((p) => checkPort(ip, p)));
    const openPorts = portChecks.filter(Boolean);

    if (openPorts.length > 0) {
      const onvifMatch = onvifFound.find((d) => d.ip === ip);
      const sadpMatch = sadpFound.find((d) => d.ip === ip);
      const mac = macMap.get(ip) || 'N/A';

      results.push({
        ip,
        mac,
        openPorts,
        hasRtsp: openPorts.includes(554) || openPorts.includes(8554),
        onvifMatch: Boolean(onvifMatch),
        sadpMatch: Boolean(sadpMatch),
        onvifEndpoint: onvifMatch ? onvifMatch.xaddr : undefined,
      });
    }
  }

  console.log('═'.repeat(80));
  console.log('📊 REFRESHED LIVE CAMERA SCAN RESULTS\n');
  console.log(`Total verified camera/DVR endpoints: ${results.length}\n`);

  results.forEach((cam, i) => {
    console.log(`${i + 1}. IP: ${cam.ip}`);
    console.log(`   MAC Address: ${cam.mac}`);
    console.log(`   Open Ports:  ${cam.openPorts.join(', ')}`);
    console.log(`   RTSP:        ${cam.hasRtsp ? '✓ Active (Port 554)' : '✗'}`);
    console.log(`   ONVIF:       ${cam.onvifMatch ? '✓ Supported' : '✗'}`);
    if (cam.sadpMatch) console.log('   SADP:        ✓ Hikvision SADP Responded!');
    if (cam.onvifEndpoint) console.log(`   ONVIF URL:   ${cam.onvifEndpoint}`);
    console.log('');
  });

  if (sadpFound.length > 0) {
    console.log('Hikvision SADP Responses:');
    console.log(JSON.stringify(sadpFound, null, 2));
  }
}

main().catch(console.error);
