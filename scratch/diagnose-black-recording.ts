import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
import { GatewayClient } from '../edge-agent/src/registration/gateway-client.js';
import { authenticatedFetch } from '../edge-agent/src/monitoring/http-auth.js';
import { deviceArchivePlaybackUri } from '../edge-agent/src/monitoring/recorder-probe.js';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const install='C:/Program Files/Sentinel Grid/Edge Agent';
const identity=await new DeviceIdentityStore(`${install}/data/device-identity.enc`,`${install}/data/device-identity.key`).load();
if(!identity) throw new Error('identity_missing');
const control=new GatewayClient('https://34-14-220-41.sslip.io',undefined);control.useEdgeCredential(identity.credential);
const bootstrap=await control.getDiscoveryBootstrap(identity.agentId);
for(const camera of await control.listMonitoringCameras(identity.agentId,'0.1.48')) {
  if(!/Channel [678]$/.test(camera.name??''))continue;
  const source=await control.resolveStreamSecret(identity.agentId,camera.connectionSecretRef);
  const uri=source?new URL(source):undefined;
  console.log(JSON.stringify({cameraId:camera.id,name:camera.name,channel:camera.channel,recorderChannel:camera.recorderChannel,host:uri?.hostname,path:uri?.pathname,sourceChannel:uri?.searchParams.get('channel')}));
}
const credential=bootstrap.credentials.find(c=>c.host==='192.168.29.170');
if(!credential)throw new Error('pilot_recorder_credential_missing');
for(const path of ['/cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss','/cgi-bin/devVideoInput.cgi?action=getVideoInState','/cgi-bin/configManager.cgi?action=getConfig&name=VideoWidget[6]']) {
  try { const r=await authenticatedFetch(`http://${credential.host}${path}`,{method:'GET'},credential,5000);console.log(JSON.stringify({kind:'signal-check',path,status:r.status,body:(await r.text()).slice(0,3500)})); }
  catch { console.log(JSON.stringify({kind:'signal-check',path,error:'unavailable'})); }
}
const dir='scratch/black-recording-20261004';await mkdir(dir,{recursive:true});
const ffmpegDir=(await readdir(`${install}/runtime`)).find(n=>n.startsWith('ffmpeg-'));
if(!ffmpegDir)throw new Error('ffmpeg_missing');
const ffmpeg=`${install}/runtime/${ffmpegDir}/bin/ffmpeg.exe`;
for(const channel of [6,7,8]) {
  try{
    const response=await authenticatedFetch(`http://${credential.host}/cgi-bin/snapshot.cgi?channel=${channel}`,{method:'GET'},credential,5000);
    console.log(JSON.stringify({channel,kind:'live',status:response.status,contentType:response.headers.get('content-type')}));
    if(response.ok&&response.headers.get('content-type')?.includes('image')) await writeFile(`${dir}/live-${channel}.jpg`,Buffer.from(await response.arrayBuffer()));
  }catch{console.log(JSON.stringify({channel,kind:'live',error:'snapshot_unavailable'}));}
  const uri=deviceArchivePlaybackUri({host:credential.host,rtspPort:554,username:credential.username,password:credential.password??'',vendor:'cp-plus',apiFamily:'dahua-cgi'},new Date('2026-10-04T03:40:04Z'),new Date('2026-10-04T03:40:34Z'),channel);
  if(!uri)continue;
  await new Promise<void>(resolve=>{
    const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-rtsp_transport','tcp','-i',uri,'-frames:v','1','-y',`${dir}/archive-${channel}.jpg`],{stdio:['ignore','ignore','pipe'],windowsHide:true});
    child.stderr.on('data',()=>{});
    const timer=setTimeout(()=>child.kill(),20000);
    child.on('error',()=>{clearTimeout(timer);console.log(JSON.stringify({channel,kind:'archive',error:'ffmpeg_failed'}));resolve();});
    child.on('close',code=>{clearTimeout(timer);console.log(JSON.stringify({channel,kind:'archive',code}));resolve();});
  });
}
