import { mkdir, writeFile } from 'node:fs/promises';
import { DurableRetryQueue } from '../recording-engine/src/failover/durable-retry-queue.js';
import { buildMediaGateway } from '../media-gateway/src/app.js';
import { PaddlePlateRecognizer } from '../analytics-engine/src/vehicle/anpr/paddle-ocr-adapter.js';
await mkdir('tmp/audit-corrupt-queue', {recursive:true});
await writeFile('tmp/audit-corrupt-queue/storage-retry-queue.json', '{broken');
const queue = new DurableRetryQueue('tmp/audit-corrupt-queue');
console.log('corrupt_queue_depth', await queue.getDepth());
const paths: unknown[] = [];
const base = {cameraId:'cam1',cameraNodeId:'node1',userId:'user1',tenantId:'tenant1',connectionSecretRef:'vault://cam',profiles:[{name:'main'},{name:'sub'}]};
const app = await buildMediaGateway({
 controlPlane:{consumeLiveSession:async(token:string)=>({...base,id:token,profile:token.startsWith('m')?'main':'sub',purpose:token.startsWith('t')?'talk':'view'})} as any,
 router:{ensurePath:async(...args:unknown[])=>{paths.push(args)},removePath:async()=>{}},
 secrets:{resolve:async(ref:string)=>{await new Promise(r=>setTimeout(r,10));return 'rtsp://'+ref}},
 publicHlsBaseUrl:'https://example/hls',publicWebRtcBaseUrl:'https://example/webrtc',accessTtlMs:60000
});
const start = (token:string,url='/v1/live/start')=>app.inject({method:'POST',url,payload:{controlPlaneToken:token.repeat(40)}});
await start('m'); await start('s'); console.log('profile_paths',paths);
const talks = await Promise.all([start('t1','/v1/talk/start'),start('t2','/v1/talk/start')]);
console.log('concurrent_talk_statuses',talks.map(r=>r.statusCode));
const talk=talks[0].json();
const audio=await app.inject({method:'POST',url:'/v1/talk/'+talk.sessionId+'/audio',headers:{authorization:'Bearer '+talk.audio.bearerToken,'content-type':'application/octet-stream'},payload:Buffer.alloc(16)});
console.log('audio_without_edge_status',audio.statusCode);
await app.close();
console.log('grayscale_white_preprocess', [...(new PaddlePlateRecognizer() as any).preprocess({width:1,height:1,channels:1,data:Uint8Array.of(255)})]);
