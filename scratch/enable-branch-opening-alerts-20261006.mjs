import assert from 'node:assert/strict';
import pg from 'pg';
import { NbfcRuleRepository } from '/app/dist/src/analytics/nbfc-rule-repository.js';
import { NbfcRuleEngineService } from '/app/dist/src/analytics/nbfc-rule-engine.service.js';
import { evaluateBranchOpeningDualControl } from '/app/dist/src/analytics/branch-opening-dual-control.service.js';
import { AnalyticsRepository } from '/app/dist/src/database/analytics-repository.js';
import { sortedMatchingRules } from '/app/dist/src/analytics/rule-engine.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const templateId = 'tmpl-27-opening-staff-count';
const branchIds = ['d7b23dee-9814-48c9-8805-48b61b33e3a9','921d336d-baa9-4b25-9f9f-f6542bba94cc',
  'd8467a57-dae8-4012-ba5e-c3254075aa61','6ddee070-9050-4f55-aaa1-1190654bbc6b'];
const actor = 'user-request-20261006';
const reason = 'User explicitly requested enabling all opening alerts for the four operational branches';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max:1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('branch-opening-window-20261006'))");
  const {rows: branches} = await client.query(
    "SELECT id,name FROM resource_nodes WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND node_type='branch' AND lifecycle_status='ACTIVE' AND is_active=true ORDER BY name FOR UPDATE",
    [tenantId,branchIds]);
  assert.equal(branches.length,4);
  const {rows: cameras} = await client.query(
    'SELECT id,branch_node_id FROM cameras WHERE branch_node_id=ANY($1::uuid[]) ORDER BY id',[branchIds]);
  assert.equal(cameras.length,32);
  for (const id of branchIds) assert.equal(cameras.filter(c=>c.branch_node_id===id).length,8);
  const {rows: beforePolicies} = await client.query(
    'SELECT * FROM nbfc_analytics_rules WHERE tenant_id=$1 AND template_id=$2 FOR UPDATE',[tenantId,templateId]);
  const {rows: beforeAlerts} = await client.query(
    "SELECT * FROM analytics_rules WHERE tenant_id=$1 AND camera_id=ANY($2::uuid[]) AND detection_type='dual-control-verification' AND archived_at IS NULL FOR UPDATE",
    [tenantId,cameras.map(c=>c.id)]);
  assert.equal(beforeAlerts.length,32);
  for (const camera of cameras) assert.equal(beforeAlerts.filter(r=>r.camera_id===camera.id).length,1);
  const {rows: suppression} = await client.query(
    "SELECT * FROM alert_suppression_config WHERE tenant_id=$1 AND suppressed AND (detection_type='dual-control-verification' OR detection_type IS NULL) AND (branch_id IS NULL OR branch_id::text=ANY($2::text[])) AND (camera_id IS NULL OR camera_id::text=ANY($3::text[]))",
    [tenantId,branchIds,cameras.map(c=>c.id)]);
  assert.equal(suppression.length,0,'Suppression would prevent opening alerts');
  const repository = new NbfcRuleRepository(client);
  const engine = new NbfcRuleEngineService(repository);
  const alertRepository = new AnalyticsRepository(client);
  const results = [];
  for (const branch of branches) {
    const scoped = beforePolicies.filter(r=>r.branch_ids.includes(branch.id));
    assert.equal(scoped.length,1);
    assert.deepEqual(scoped[0].branch_ids,[branch.id]);
    const source = await repository.getRule(scoped[0].id);
    assert.equal(source.schedule.start,'08:00');
    assert.equal(source.schedule.end,'11:00');
    assert.equal(source.schedule.timezone,'Asia/Kolkata');
    assert.equal(source.durationMs,0);
    assert.deepEqual(source.condition,{value:2,metric:'staff_count',operator:'LESS_THAN'});
    const updated = await repository.updateRule(source.id,{enabled:true,state:'ACTIVE'},reason,actor);
    const {rows:saved} = await client.query('SELECT * FROM nbfc_analytics_rules WHERE id=$1',[source.id]);
    assert.equal(saved[0].enabled,true);
    assert.equal(saved[0].state,'ACTIVE');
    assert.deepEqual(saved[0].schedule,source.schedule);
    assert.equal(saved[0].version,updated.version);
    const {rows:versions} = await client.query('SELECT version FROM nbfc_rule_versions WHERE rule_id=$1 AND version=$2',[source.id,updated.version]);
    assert.equal(versions.length,1);
    results.push({branch:branch.name,ruleId:updated.id,schedule:updated.schedule,enabled:true,state:'ACTIVE'});
  }
  const {rowCount} = await client.query('UPDATE analytics_rules SET enabled=true,updated_at=now() WHERE id=ANY($1::uuid[])',[beforeAlerts.map(r=>r.id)]);
  assert.equal(rowCount,32);
  let checks = 0;
  // Exercise deployed decision logic using an isolated daily-state stub: no real state or events are written.
  const activePolicies = await repository.listRules({tenantId,detectorType:'person'});
  const verificationRepository = {
    listRules: async filters=>activePolicies.filter(r=>(r.branchIds.length===0 || r.branchIds.includes(filters.branchId)) &&
      (r.cameraIds.length===0 || r.cameraIds.includes(filters.cameraId))),
    claimBranchOpeningCheck: async input=>({state:{currentMetrics:{outcome:input.personCount<2?'FAILED':'SUCCESS',
      personCount:input.personCount,cameraId:input.cameraId,alertEmitted:false},firstConditionMetAt:input.occurredAt}}),
  };
  for (const camera of cameras) {
    const rules = (await alertRepository.listRules(camera.id)).filter(r=>r.detectionType==='dual-control-verification');
    assert.equal(rules.length,1);
    assert.equal(rules[0].enabled,true);
    assert.equal(rules[0].severity,'P1');
    const alertEvent = {tenantId,cameraId:camera.id,sourceEventId:'dry-run-only',detectionType:'dual-control-verification',
      occurredAt:'2026-10-06T09:00:00+05:30',confidence:0.95,durationSeconds:0,modelVersion:'verification-only',objects:[],
      metadata:{violation:'BRANCH_OPENING_MINIMUM_STAFF',staffCount:1,requiredStaff:2}};
    assert.equal(sortedMatchingRules(rules,alertEvent).length,1);
    for (let day=5;day<=11;day++) {
      const weekday = new Date(`2026-10-${String(day).padStart(2,'0')}T09:00:00+05:30`).getUTCDay();
      for (const [time,inWindow] of [['07:59:00',false],['08:00:00',true],['09:30:00',true],['10:59:00',true],['11:00:00',true],['11:01:00',false]]) {
        for (const count of [0,1,2]) {
          const sample = {...alertEvent,detectionType:'person-counting',occurredAt:`2026-10-${String(day).padStart(2,'0')}T${time}+05:30`,
            metadata:{personCount:count},objects:Array.from({length:count},()=>({label:'person',confidence:0.95}))};
          const violations = await evaluateBranchOpeningDualControl(verificationRepository,engine,sample,{id:camera.id,branchId:camera.branch_node_id});
          assert.equal(violations.length,count===1 && inWindow && weekday!==0 ? 1 : 0,`${camera.id} ${day} ${time} ${count}`);
          checks++;
        }
      }
    }
  }
  const {rows:afterAlerts} = await client.query('SELECT * FROM analytics_rules WHERE id=ANY($1::uuid[])',[beforeAlerts.map(r=>r.id)]);
  assert.ok(afterAlerts.every(r=>r.enabled));
  await client.query('INSERT INTO audit_events (tenant_id,action,outcome,details) VALUES ($1,$2,$3,$4::jsonb)',
    [tenantId,'branch_opening_alerts.enabled','success',JSON.stringify({requestedBy:'user',reason,beforePolicies,beforeAlerts,afterPolicies:results,afterAlerts,checks})]);
  await client.query('COMMIT');
  console.log(JSON.stringify({enabled:true,branches:results,cameraAlertRules:32,openingDecisionChecks:checks,syntheticAlertsCreated:0}));
} catch(error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
