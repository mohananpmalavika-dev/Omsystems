import pg from 'pg';
import {loadConfig} from '/app/dist/src/config.js';
import {PostgresStore} from '/app/dist/src/database/postgres-store.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL}),store=new PostgresStore(pool);
const branch='00000000-0000-4000-8000-000000000104',target='b950f232-557e-42cd-8bc8-8f4490d0b68b';
try{
 const cams=(await pool.query(`SELECT c.id,c.channel,c.recorder_channel,c.ip_address,c.edge_agent_id,c.connection_secret_ref,c.source_type,c.recorder_id,c.recorder_serial_number,rn.name
 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id WHERE c.branch_node_id=$1 AND rn.is_active=true ORDER BY c.channel`,[branch])).rows;
 for(const c of cams){const source=await store.resolveStreamSecret(c.connection_secret_ref,target);
  c.secretResolvableByCurrentGateway=!!source;
  if(source){const u=new URL(source);c.source={host:u.hostname,port:u.port,path:u.pathname,channel:u.searchParams.get('channel'),subtype:u.searchParams.get('subtype')};}
 }
 const discoveries=(await pool.query(`SELECT id,edge_agent_id,ip_address,recorder_channel,display_name,status,stream_verified,rtsp_validated,credentials_required,source_type,existing_device_association,recorder_serial_number
 FROM camera_discoveries WHERE branch_node_id=$1 ORDER BY edge_agent_id,recorder_channel`,[branch])).rows;
 const commands=(await pool.query(`SELECT id,edge_agent_id,command_type,status,payload->>'cameraId' AS camera_id,payload->>'releaseVersion' AS release_version,requested_at,completed_at
 FROM edge_commands WHERE branch_node_id=$1 ORDER BY requested_at DESC LIMIT 12`,[branch])).rows;
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),cams,discoveries,commands},null,2));
}finally{await pool.end();}
