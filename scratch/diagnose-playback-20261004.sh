set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT c.id,n.name,c.channel,c.recorder_channel,c.recorder_id,c.edge_agent_id,c.connection_secret_ref,c.branch_node_id FROM cameras c JOIN resource_nodes n ON n.id=c.resource_node_id WHERE c.id='e1a583ff-bbce-4a10-9d8d-6c0e7a9b8f21';
SELECT id,name,version,status,last_seen_at FROM edge_agents;
SELECT c.id,n.name,b.name AS branch,c.channel,c.edge_agent_id,c.recorder_id FROM cameras c JOIN resource_nodes n ON n.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id WHERE n.name LIKE '%Channel 7%';
SQL
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {randomBytes,createHash}=require('node:crypto');const {Pool}=require('pg');
(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL});const sessionId=randomBytes(16).toString('hex');try{
const u=(await p.query("SELECT id,tenant_id FROM users WHERE username='mgdhanyamohan'")).rows[0];if(!u)throw new Error('Owner account unavailable');
const token=randomBytes(64).toString('base64url');const hash=v=>createHash('sha256').update(v).digest('base64');
await p.query('INSERT INTO user_sessions (id,user_id,tenant_id,access_token_hash,refresh_token_hash,access_expires_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$6)',[sessionId,u.id,u.tenant_id,hash(token),hash(randomBytes(64).toString('base64url')),new Date(Date.now()+300000)]);
const cameraId='fa884a52-2378-4981-9c09-4620c12a9de5';
const r=await fetch('http://localhost:8080/v1/cameras/'+cameraId+'/storage-sessions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});const g=await r.json();console.log('STORAGE_GRANT',JSON.stringify({status:r.status,error:g.error,mediaGatewayUrl:g.mediaGatewayUrl,localMediaGatewayUrl:g.localMediaGatewayUrl}));if(!r.ok)return;
const base=g.mediaGatewayUrl||g.localMediaGatewayUrl;if(!base)throw new Error('No gateway address');
const from=new Date(Date.now()-3600000).toISOString(),to=new Date().toISOString();const s=await fetch(base.replace(/\/$/,'')+'/v1/storage/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({controlPlaneToken:g.token,from,to}),signal:AbortSignal.timeout(45000)});const body=await s.json();console.log('ARCHIVE_SEARCH',JSON.stringify({status:s.status,from,to,error:body.error,clips:body.clips?.slice(0,3),clipCount:body.clips?.length}));
if(s.ok&&body.clips?.length){const clip=body.clips[0];const grant=await(await fetch('http://localhost:8080/v1/cameras/'+cameraId+'/storage-sessions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'})).json();
const play=await fetch(base.replace(/\/$/,'')+'/v1/storage/play',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({controlPlaneToken:grant.token,from:clip.startTime,to:new Date(Date.parse(clip.startTime)+30000).toISOString(),apiFamily:clip.apiFamily})});const playback=await play.json();console.log('PLAY',JSON.stringify({status:play.status,error:playback.error,hasHls:!!playback.hls?.url}));
if(play.ok&&playback.hls){const headers={authorization:'Bearer '+playback.hls.bearerToken};try{let manifest;for(let i=0;i<12;i++){const r=await fetch(playback.hls.url,{headers,signal:AbortSignal.timeout(15000)});const text=await r.text();console.log('HLS',JSON.stringify({attempt:i,status:r.status,bytes:text.length,codecs:text.match(/CODECS="([^"]+)"/)?.[1]}));if(r.ok){manifest=text;break;}await new Promise(r=>setTimeout(r,2000));}
if(manifest){let mediaUrl=playback.hls.url;if(manifest.includes('#EXT-X-STREAM-INF')){const variant=manifest.split(/\r?\n/).find(l=>l.trim()&&!l.startsWith('#'));mediaUrl=new URL(variant,mediaUrl).href;manifest=await(await fetch(mediaUrl,{headers})).text();}const segment=manifest.split(/\r?\n/).find(l=>l.trim()&&!l.startsWith('#'));if(segment){const r=await fetch(new URL(segment,mediaUrl),{headers});console.log('HLS_SEGMENT',JSON.stringify({status:r.status,bytes:(await r.arrayBuffer()).byteLength}));}}
}finally{await fetch(base.replace(/\/$/,'')+'/v1/live/'+playback.sessionId,{method:'DELETE',headers});}}}
}finally{await p.query('DELETE FROM user_sessions WHERE id=$1',[sessionId]);await p.end();}})().catch(e=>{console.error(e.message);process.exit(1)});
JS
