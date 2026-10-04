
const { Pool } = require('pg');
const profiles = {"1": [{"name": "main", "role": "main", "codec": "H264", "width": 1280, "height": 720, "frameRate": 50.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "2": [{"name": "main", "role": "main", "codec": "H264", "width": 960, "height": 576, "frameRate": 25.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "3": [{"name": "main", "role": "main", "codec": "H264", "width": 1280, "height": 720, "frameRate": 30.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "4": [{"name": "main", "role": "main", "codec": "H264", "width": 1280, "height": 720, "frameRate": 30.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "5": [{"name": "main", "role": "main", "codec": "H264", "width": 1280, "height": 720, "frameRate": 35.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "6": [{"name": "main", "role": "main", "codec": "H264", "width": 960, "height": 1080, "frameRate": 30.0, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "7": [{"name": "main", "role": "main", "codec": "H264", "width": 960, "height": 1080, "frameRate": 25.08, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H264", "width": 352, "height": 288, "frameRate": 14.0, "preferredFor": ["live", "analytics"]}], "8": [{"name": "main", "role": "main", "codec": "H265", "width": 960, "height": 1080, "frameRate": 24.92, "preferredFor": ["recording"]}, {"name": "sub", "role": "sub", "codec": "H265", "width": 352, "height": 288, "frameRate": 25.25, "preferredFor": ["live", "analytics"]}]};
(async () => {
 const pool = new Pool({connectionString:process.env.DATABASE_URL});
 const client = await pool.connect();
 const agent='aaeda07f-01ce-4361-afd3-a54e4ca114f3';
 const branch='00000000-0000-4000-8000-000000000104';
 try {
  await client.query('BEGIN');
  const cameras=await client.query(`SELECT id,channel,profiles,recorder_channel FROM cameras
    WHERE edge_agent_id=$1 AND branch_node_id=$2 AND ip_address='192.168.29.170' ORDER BY channel FOR UPDATE`,[agent,branch]);
  if(cameras.rows.length!==8 || new Set(cameras.rows.map(c=>c.channel)).size!==8)throw Error('Camera inventory changed');
  const node=await client.query('SELECT tenant_id::text FROM resource_nodes WHERE id=$1',[branch]);
  const tenant=node.rows[0].tenant_id;
  const policyRows=await client.query('SELECT state FROM branch_protection_state WHERE tenant_id=$1 AND branch_id=$2 FOR UPDATE',[tenant,branch]);
  const beforePolicy=policyRows.rows[0]?.state ?? null;
  const state=beforePolicy ? structuredClone(beforePolicy) : {policy:{enabled:false,verificationIntervalMinutes:15,verificationFreshMinutes:30,maxGapSeconds:60,requiredRetentionDays:90,criticalCameraIds:[],bandwidthMode:'normal',maxConcurrentStreams:4,sopRules:[]},checks:{},reviews:[]};
  const beforeLimit=state.policy.maxConcurrentStreams;
  state.policy.maxConcurrentStreams=Math.max(beforeLimit,12);
  for(const camera of cameras.rows){
   if(!profiles[camera.channel])throw Error('Verified profile missing');
   await client.query('UPDATE cameras SET profiles=$2::jsonb,recorder_channel=channel WHERE id=$1',[camera.id,JSON.stringify(profiles[camera.channel])]);
  }
  await client.query('INSERT INTO branch_protection_state(tenant_id,branch_id,state) VALUES($1,$2,$3) ON CONFLICT(tenant_id,branch_id) DO UPDATE SET state=EXCLUDED.state,updated_at=now()',[tenant,branch,JSON.stringify(state)]);
  await client.query('INSERT INTO branch_protection_audit(tenant_id,branch_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)',[tenant,branch,'043561dc-a162-48ca-b7e4-290a9c4ad1ff','camera_wall_live_repair',JSON.stringify({performedBy:'Codex',requestedBy:'mgdhanyamohan',previousStreamLimit:beforeLimit,streamLimit:state.policy.maxConcurrentStreams,verifiedDvrProfiles:8,reason:'User requested all available camera streams online'})]);
  await client.query('COMMIT');
  console.log(JSON.stringify({updatedCameras:8,previousLimit:beforeLimit,streamLimit:state.policy.maxConcurrentStreams,backup:{cameras:cameras.rows,tenant,branch,state:beforePolicy}}));
 }catch(error){await client.query('ROLLBACK');console.error(error.message);process.exitCode=1;}
 finally{client.release();await pool.end();}
})();
