
const {Pool}=require('pg');const {createDecipheriv,createCipheriv,randomBytes}=require('node:crypto');
const profiles=[{"name": "main", "role": "main", "codec": "H264", "width": 2560, "height": 1440, "frameRate": 24.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 800, "height": 448, "frameRate": 12.0, "preferredFor": ["live", "analytics"]}];
(async()=>{const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
try{await client.query('BEGIN');
const result=await client.query(`SELECT c.id,c.branch_node_id,c.profiles,c.connection_secret_ref,s.encrypted_uri,s.edge_agent_id,rn.tenant_id::text FROM cameras c JOIN central_stream_secrets s ON s.reference=c.connection_secret_ref JOIN resource_nodes rn ON rn.id=c.resource_node_id WHERE c.id=$1 AND c.edge_agent_id=$2 AND c.ip_address='192.168.29.58' FOR UPDATE OF c,s`,['b58d2744-7613-4dd0-80b3-94af6fb18bb7','aaeda07f-01ce-4361-afd3-a54e4ca114f3']);
if(result.rows.length!==1)throw Error('IP camera inventory changed');const row=result.rows[0];
const key=Buffer.from(process.env.STREAM_VAULT_KEY,'base64');const payload=Buffer.from(row.encrypted_uri,'base64');const decipher=createDecipheriv('aes-256-gcm',key,payload.subarray(0,12));decipher.setAAD(Buffer.from(row.connection_secret_ref));decipher.setAuthTag(payload.subarray(12,28));const old=Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]).toString('utf8');
const uri=new URL(old);if(uri.hostname!=='192.168.29.58'||!uri.pathname.includes('_channel=0_stream='))throw Error('IP source changed');
const corrected=old.replace(/&onvif=0(?=\.sdp)/,'').replace(/_stream=\d+/, '_stream=0');
const encrypt=(ref,value)=>{const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(ref));const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');};
const subRef=row.connection_secret_ref+'#sub';const previousSub=await client.query('SELECT reference,edge_agent_id,encrypted_uri FROM central_stream_secrets WHERE reference=$1 FOR UPDATE',[subRef]);
await client.query('UPDATE central_stream_secrets SET encrypted_uri=$2 WHERE reference=$1',[row.connection_secret_ref,encrypt(row.connection_secret_ref,corrected)]);
await client.query('INSERT INTO central_stream_secrets(reference,edge_agent_id,encrypted_uri) VALUES($1,$2,$3) ON CONFLICT(reference) DO UPDATE SET encrypted_uri=EXCLUDED.encrypted_uri',[subRef,row.edge_agent_id,encrypt(subRef,corrected.replace('_stream=0','_stream=1'))]);
await client.query('UPDATE cameras SET profiles=$2::jsonb WHERE id=$1',[row.id,JSON.stringify(profiles)]);
await client.query('INSERT INTO branch_protection_audit(tenant_id,branch_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)',[row.tenant_id,row.branch_node_id,'043561dc-a162-48ca-b7e4-290a9c4ad1ff','camera_wall_ip_source_repair',JSON.stringify({performedBy:'Codex',cameraId:row.id,verifiedProfiles:2,reason:'Corrected invalid XM stream URI after live packet verification'})]);
await client.query('COMMIT');console.log(JSON.stringify({updatedIpCamera:true,profiles,backup:{cameraId:row.id,profiles:row.profiles,reference:row.connection_secret_ref,encrypted_uri:row.encrypted_uri,previousSub:previousSub.rows[0]??null}}));
}catch(error){await client.query('ROLLBACK');console.error('IP repair failed: '+error.message);process.exitCode=1;}finally{client.release();await pool.end();}})();
