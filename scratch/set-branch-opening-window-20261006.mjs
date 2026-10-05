import assert from 'node:assert/strict';
import pg from 'pg';
import { NbfcRuleRepository } from '/app/dist/src/analytics/nbfc-rule-repository.js';
import { NbfcRuleEngineService } from '/app/dist/src/analytics/nbfc-rule-engine.service.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const templateId = 'tmpl-27-opening-staff-count';
const branches = [
  ['d7b23dee-9814-48c9-8805-48b61b33e3a9', 'Bettaih'],
  ['921d336d-baa9-4b25-9f9f-f6542bba94cc', 'Hajipur'],
  ['d8467a57-dae8-4012-ba5e-c3254075aa61', 'PERAVARUNI'],
  ['6ddee070-9050-4f55-aaa1-1190654bbc6b', 'Rajkot'],
];
const reason = 'User requested the four branches opening window from 08:00 to 11:00 IST';
const actor = 'user-request-20261006';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('branch-opening-window-20261006'))");
  const repository = new NbfcRuleRepository(client);
  const engine = new NbfcRuleEngineService(repository);
  const { rows: before } = await client.query(
    'SELECT * FROM nbfc_analytics_rules WHERE tenant_id=$1 AND template_id=$2 FOR UPDATE',
    [tenantId, templateId]);
  const global = before.filter(r => r.branch_ids.length === 0);
  assert.equal(global.length, 1, 'Expected exactly one inherited opening policy');
  const inherited = await repository.getRule(global[0].id);
  const results = [];
  for (const [id, name] of branches) {
    const { rows: nodes } = await client.query(
      "SELECT id,name FROM resource_nodes WHERE id=$1 AND tenant_id=$2 AND node_type='branch' AND lifecycle_status='ACTIVE' AND is_active=true FOR UPDATE",
      [id, tenantId]);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, name);
    const scoped = before.filter(r => r.branch_ids.includes(id));
    assert.ok(scoped.length <= 1, 'Ambiguous branch-specific policy');
    if (scoped.length) assert.deepEqual(scoped[0].branch_ids, [id]);
    const source = scoped.length ? await repository.getRule(scoped[0].id) : inherited;
    const schedule = { ...source.schedule, type: 'BRANCH_OPENING', start: '08:00', end: '11:00', timezone: 'Asia/Kolkata' };
    const rule = scoped.length
      ? await repository.updateRule(source.id, { schedule }, reason, actor)
      : await repository.createRule({ ...source, id: undefined, branchIds: [id], scopeType: 'BRANCH',
          parentRuleId: inherited.id, schedule, createdBy: actor }, reason);
    // Query the persisted row directly; repository fallback must never mask an error.
    const { rows: saved } = await client.query('SELECT * FROM nbfc_analytics_rules WHERE id=$1', [rule.id]);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].schedule, schedule);
    assert.equal(saved[0].enabled, source.enabled);
    assert.equal(saved[0].state, source.state);
    assert.deepEqual(saved[0].branch_ids, [id]);
    assert.equal(saved[0].version, rule.version);
    const { rows: versions } = await client.query('SELECT version FROM nbfc_rule_versions WHERE rule_id=$1 AND version=$2', [rule.id,rule.version]);
    assert.equal(versions.length, 1);
    for (const [time, expected] of [['07:59:00',false],['08:00:00',true],['09:30:00',true],['10:59:00',true],['11:01:00',false]]) {
      assert.equal(engine.isWithinSchedule(schedule, new Date(`2026-10-06T${time}+05:30`)), expected, `${name} ${time}`);
    }
    results.push({ branch: name, ruleId: rule.id, schedule, enabled: rule.enabled, state: rule.state });
  }
  await client.query(
    'INSERT INTO audit_events (tenant_id,action,outcome,details) VALUES ($1,$2,$3,$4::jsonb)',
    [tenantId,'branch_opening_window.configured','success',JSON.stringify({ requestedBy:'user',reason,beforeRules:before,afterRules:results })]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ saved:true, branches:results, boundaryChecks:20 }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
