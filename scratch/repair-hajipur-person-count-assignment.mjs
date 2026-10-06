import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {loadConfig} from '/app/dist/src/config.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL});
const branchId='921d336d-baa9-4b25-9f9f-f6542bba94cc';
const oldAgent='839d2a88-2b36-4e34-bd99-6cb247e196a5';
const targetAgent='9f108498-4dd5-4a21-b810-eec9e538953c';
const client=await pool.connect();
try {
 await client.query('BEGIN');
 const agent=(await client.query(`SELECT a.id,a.last_seen_at FROM edge_agents a JOIN resource_nodes branch ON branch.id=$2
   WHERE a.id=$1 AND a.credential_revoked_at IS NULL AND a.tenant_id=branch.tenant_id
   AND (a.branch_node_id=branch.id OR EXISTS (SELECT 1 FROM edge_agent_branch_assignments b WHERE b.edge_agent_id=a.id AND b.branch_node_id=branch.id AND b.tenant_id=a.tenant_id))`,[targetAgent,branchId])).rows[0];
 if(!agent)throw new Error('Target gateway is not authorised for this branch');
 const rows=(await client.query(`SELECT c.id,c.edge_agent_id,c.connection_secret_ref FROM cameras c
   JOIN central_stream_secrets s ON s.reference=c.connection_secret_ref
   WHERE c.branch_node_id=$1 AND c.edge_agent_id=$2 AND c.recorder_channel BETWEEN 2 AND 8
   AND host(c.ip_address)='172.29.91.100' AND s.edge_agent_id=$3
   AND c.connection_secret_ref LIKE $4 FOR UPDATE OF c`,[branchId,oldAgent,targetAgent,`edge://${targetAgent}/hajipur-ch%`])).rows;
 if(rows.length!==7 && rows.length!==0)throw new Error(`Expected seven camera assignments, found ${rows.length}`);
 if(!process.argv.includes('--apply')) {
  console.log(JSON.stringify({mode:'dry-run',cameras:rows.map(r=>r.id),targetGatewayLastSeenAt:agent.last_seen_at}));
  await client.query('ROLLBACK');
 } else {
  if(rows.length) {
   const backup=`/tmp/hajipur-camera-assignment-before-${Date.now()}.json`;
   await writeFile(backup,JSON.stringify(rows,null,2),{mode:0o600,flag:'wx'});
   const updated=await client.query('UPDATE cameras SET edge_agent_id=$1 WHERE id=ANY($2::uuid[]) AND edge_agent_id=$3',[targetAgent,rows.map(r=>r.id),oldAgent]);
   if(updated.rowCount!==7)throw new Error('Assignment changed concurrently');
   console.log(JSON.stringify({updated:updated.rowCount,backup}));
  } else console.log(JSON.stringify({updated:0,reason:'already repaired or no matching assignments'}));
  await client.query('COMMIT');
 }
} catch(error) {await client.query('ROLLBACK');throw error;}
finally {client.release();await pool.end();}
