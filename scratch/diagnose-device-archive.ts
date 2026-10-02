import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
import { GatewayClient } from '../edge-agent/src/registration/gateway-client.js';
import { authenticatedFetch } from '../edge-agent/src/monitoring/http-auth.js';
import { deviceArchivePlaybackUri, searchDeviceArchive } from '../edge-agent/src/monitoring/recorder-probe.js';
import { probeRtsp } from '../edge-agent/src/streaming/rtsp-probe.js';

const install = 'C:/Program Files/Sentinel Grid/Edge Agent';
const identity = await new DeviceIdentityStore(`${install}/data/device-identity.enc`, `${install}/data/device-identity.key`).load();
if (!identity) throw new Error('identity_missing');
const control = new GatewayClient('https://34-14-220-41.sslip.io', undefined);
control.useEdgeCredential(identity.credential);
const credential = (await control.getDiscoveryBootstrap(identity.agentId)).credentials.find(item => item.host === '192.168.29.171');
if (!credential) throw new Error('recorder_credential_missing');
const credentials = { username: credential.username, password: credential.password ?? '' };
if (process.argv.includes('--verify')) {
  const clips = await searchDeviceArchive({host: credential.host, port:80, vendor:'onvif', ...credentials}, new Date(2026,9,1,22,10), new Date(2026,9,2,22,10), 10000, 1);
  console.log(JSON.stringify({verified:true, channel:1, clips:clips.length, first:clips[0], last:clips.at(-1)}));
  const clip = clips[0];
  if (clip) {
    const uri = deviceArchivePlaybackUri({host:credential.host, vendor:'onvif', apiFamily:clip.apiFamily, ...credentials}, new Date(clip.startTime), new Date(clip.endTime), 1);
    if (!uri) throw new Error('playback_uri_missing');
    const playback = await probeRtsp(uri, `${install}/runtime/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1/bin/ffprobe.exe`, 15000);
    console.log(JSON.stringify({playbackVerified:playback.reachable, codec:playback.codec, width:playback.width, height:playback.height}));
  }
  process.exit(0);
}
const base = 'http://192.168.29.171/cgi-bin/mediaFileFind.cgi';
const factory = await authenticatedFetch(`${base}?action=factory.create`, {method:'GET'}, credentials, 5000);
const factoryBody = await factory.text();
const object = factoryBody.match(/(?:object|result)=(\d+)/)?.[1]?.trim();
console.log(JSON.stringify({step:'factory', status:factory.status, body:factoryBody.slice(0, 200)}));
if (!object) throw new Error('handle_missing');
try {
  for (const channel of ['0','1']) {
  for (const typed of [true,false]) {
  const query = new URLSearchParams({action:'findFile',object,'condition.Channel':'0','condition.StartTime':'2026-10-01 22:10:00','condition.EndTime':'2026-10-02 22:10:00','condition.Types[0]':'dav'});
  query.set('condition.Channel', channel);
  if (!typed) query.delete('condition.Types[0]');
  const find = await authenticatedFetch(`${base}?${query.toString().replace(/\+/g, '%20')}`, {method:'GET'}, credentials, 5000);
  console.log(JSON.stringify({step:'find',channel,typed,status:find.status,body:(await find.text()).slice(0,200)}));
  if (!find.ok) continue;
  const next = await authenticatedFetch(`${base}?${new URLSearchParams({action:'findNextFile',object,count:'128'})}`, {method:'GET'}, credentials, 5000);
  const text = await next.text();
  console.log(JSON.stringify({step:'next',status:next.status,body:text.split(/\r?\n/).filter(line => /^(found=|(?:items|item)\[\d+\]\.(?:Channel|StartTime|EndTime)=)/i.test(line)).slice(0,16).join('\n'), keys:text.split(/\r?\n/).slice(0,12).map(line => line.split('=')[0])}));
  }
  }
} finally {
  await authenticatedFetch(`${base}?${new URLSearchParams({action:'close',object})}`, {method:'GET'}, credentials, 5000);
}
