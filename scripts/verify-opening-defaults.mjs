// Run against PostgreSQL with the migration installed. All QA rows roll back.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client = await pool.connect();
const tenantId='00000000-0000-4000-8000-000000000001';
const branchId=randomUUID();
const expected={type:'BRANCH_OPENING',start:'08:00',end:'11:00',timezone:'Asia/Kolkata',days:[1,2,3,4,5,6]};
let checks=0;
try {
  await client.query('BEGIN');
  if (globalThis.openingDefaultsMigration) await client.query(globalThis.openingDefaultsMigration);
  const {rows:[parent]}=await client.query("SELECT p.id,p.path FROM resource_nodes b JOIN resource_nodes p ON p.id=b.parent_id WHERE b.id='d7b23dee-9814-48c9-8805-48b61b33e3a9' AND b.tenant_id=$1",[tenantId]);
  await client.query("INSERT INTO resource_nodes (id,tenant_id,parent_id,node_type,name,path) VALUES ($1,$2,$3,'branch','Opening defaults QA rollback',text2ltree($4))",[branchId,tenantId,parent.id,`${parent.path}.${branchId.replaceAll('-','_')}`]);
  async function policyFor(id) {
    const {rows}=await client.query("SELECT * FROM nbfc_analytics_rules WHERE tenant_id=$1 AND template_id='tmpl-27-opening-staff-count' AND branch_ids=jsonb_build_array($2::text)",[tenantId,id]);
    assert.equal(rows.length,1);checks++;
    return rows[0];
  }
  const policy=await policyFor(branchId);
  assert.equal(policy.enabled,true);assert.equal(policy.state,'ACTIVE');assert.deepEqual(policy.schedule,expected);checks+=3;
  const {rows:versions}=await client.query('SELECT rule_snapshot FROM nbfc_rule_versions WHERE rule_id=$1',[policy.id]);
  assert.equal(versions.length,1);assert.equal(versions[0].rule_snapshot.enabled,true);checks+=2;
  async function addCamera(branch) {
    const nodeId=randomUUID();
    await client.query("INSERT INTO resource_nodes (id,tenant_id,parent_id,node_type,name,path) SELECT $1,tenant_id,id,'camera','Opening defaults camera QA',path || text2ltree($3) FROM resource_nodes WHERE id=$2",[nodeId,branch,nodeId.replaceAll('-','_')]);
    const {rows:[camera]}=await client.query("INSERT INTO cameras (resource_node_id,branch_node_id,vendor,model,channel,protocol,connection_secret_ref,first_seen_at,identity_last_seen_at) VALUES ($1,$2,'other','opening-defaults-qa',1,'rtsp',$3,now(),now()) RETURNING id",[nodeId,branch,`qa-rollback-only:${randomUUID()}`]);
    const {rows:rules}=await client.query("SELECT * FROM analytics_rules WHERE camera_id=$1 AND detection_type='dual-control-verification' AND archived_at IS NULL",[camera.id]);
    assert.equal(rules.length,1);assert.equal(rules[0].enabled,true);assert.equal(rules[0].severity,'P1');
    assert.deepEqual(rules[0].object_classes,[]);assert.equal(rules[0].recording_policy,'protect-window');checks+=5;
    return camera.id;
  }
  await addCamera(branchId);
  await addCamera(branchId);
  assert.equal((await policyFor(branchId)).id,policy.id);checks++;
  const custom={...expected,start:'09:15',end:'10:45'};
  await client.query("UPDATE nbfc_analytics_rules SET schedule=$2,enabled=false,state='INACTIVE' WHERE id=$1",[policy.id,custom]);
  await addCamera(branchId);
  const preserved=await policyFor(branchId);
  assert.deepEqual(preserved.schedule,custom);assert.equal(preserved.enabled,false);checks+=2;
  // Add a camera to an existing operational branch; its configured policy survives.
  const existing=await policyFor('d7b23dee-9814-48c9-8805-48b61b33e3a9');
  await addCamera('d7b23dee-9814-48c9-8805-48b61b33e3a9');
  const after=await policyFor('d7b23dee-9814-48c9-8805-48b61b33e3a9');
  assert.equal(after.id,existing.id);assert.deepEqual(after.schedule,existing.schedule);assert.equal(after.enabled,existing.enabled);checks+=3;
  // A legacy branch without an opening policy receives one on its first camera.
  await client.query('DELETE FROM nbfc_analytics_rules WHERE id=$1',[policy.id]);
  await addCamera(branchId);
  const repaired=await policyFor(branchId);
  assert.equal(repaired.enabled,true);assert.deepEqual(repaired.schedule,expected);checks+=2;
  await client.query('ROLLBACK');
  const {rows:[remaining]}=await client.query('SELECT count(*)::int AS count FROM resource_nodes WHERE id=$1',[branchId]);
  assert.equal(remaining.count,0);checks++;
  console.log(JSON.stringify({verified:true,checks,newBranch:true,newCameras:5,customScheduleAndDisabledModePreserved:true,qaRowsPersisted:0}));
} catch(error) {
  await client.query('ROLLBACK');throw error;
} finally {client.release();await pool.end();}
