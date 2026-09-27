import dgram from 'node:dgram';

console.log('Sending Deep Multicast & Broadcast Probes...');

// 1. Hikvision SADP (37020)
const sadp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const sadpProbe = Buffer.from([
  0x21, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);

sadp.on('message', (msg, rinfo) => {
  console.log(`[SADP] Found Hikvision at ${rinfo.address}:${rinfo.port}`);
});

// 2. Dahua discovery (37810)
const dahua = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const dahuaProbe = Buffer.from('DHIP\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'utf8');

dahua.on('message', (msg, rinfo) => {
  console.log(`[Dahua DHIP] Found device at ${rinfo.address}:${rinfo.port}`);
});

// 3. ONVIF Broadcast (3702)
const onvif = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const onvifMsg = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"><s:Header><a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action><a:MessageID>uuid:12345</a:MessageID><a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To></s:Header><s:Body><Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery"><d:Types xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dp0="http://www.onvif.org/ver10/network/wsdl">dp0:NetworkVideoTransmitter</d:Types></Probe></s:Body></s:Envelope>',
  'utf8'
);

onvif.on('message', (msg, rinfo) => {
  console.log(`[ONVIF] Found device at ${rinfo.address}:${rinfo.port}`);
});

sadp.bind(() => {
  try {
    sadp.setBroadcast(true);
    sadp.send(sadpProbe, 37020, '239.255.255.250');
    sadp.send(sadpProbe, 37020, '255.255.255.255');
  } catch {}
});

dahua.bind(() => {
  try {
    dahua.setBroadcast(true);
    dahua.send(dahuaProbe, 37810, '239.255.255.250');
    dahua.send(dahuaProbe, 37810, '255.255.255.255');
  } catch {}
});

onvif.bind(() => {
  try {
    onvif.setBroadcast(true);
    onvif.send(onvifMsg, 3702, '255.255.255.255');
    onvif.send(onvifMsg, 3702, '192.168.29.255');
    onvif.send(onvifMsg, 3702, '239.255.255.250');
  } catch {}
});

setTimeout(() => {
  try { sadp.close(); } catch {}
  try { dahua.close(); } catch {}
  try { onvif.close(); } catch {}
  console.log('Finished deep multicast probe.');
}, 5000);
