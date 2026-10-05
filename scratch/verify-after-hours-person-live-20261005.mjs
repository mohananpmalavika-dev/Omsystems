import assert from 'node:assert/strict';
import pg from 'pg';
import { AnalyticsRepository } from '/app/dist/src/database/analytics-repository.js';
import { analyticsAlertTitle, sortedMatchingRules } from '/app/dist/src/analytics/rule-engine.js';
import { resolveAlertSeverity } from '/app/dist/src/analytics/severity-policy.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const repository = new AnalyticsRepository(pool);
  const { rows: cameras } = await pool.query(`SELECT DISTINCT camera_id FROM analytics_rules WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND detection_type='person' AND archived_at IS NULL`);
  assert.equal(cameras.length, 43);
  let checks = 0;
  for (const { camera_id } of cameras) {
    const rules = (await repository.listRules(camera_id)).filter(rule => rule.detectionType === 'person');
    assert.equal(rules.length, 1);
    const rule = rules[0];
    assert.equal(rule.enabled, true);
    assert.equal(rule.severity, 'P1');
    assert.equal(analyticsAlertTitle(rule), 'Person Detected after office hour');
    assert.equal(rule.zone, undefined);
    assert.deepEqual(rule.schedule, { days: [0,1,2,3,4,5,6], start: '20:00', end: '08:00', timezone: 'Asia/Kolkata' });
    for (let day = 5; day <= 11; day++) {
      for (const [time, expected] of [['19:59:59',false],['20:00:00',true],['23:59:59',true],['00:00:00',true],['07:59:59',true],['08:00:00',false],['12:00:00',false]]) {
        for (const recognised of [false, true]) {
          const event = { tenantId: rule.tenantId, cameraId: camera_id, sourceEventId: 'dry-run-only', detectionType: 'person', occurredAt: new Date(`2026-10-${String(day).padStart(2,'0')}T${time}+05:30`).toISOString(), confidence: 0.95, durationSeconds: 0, modelVersion: 'verification-only', objects: [{ label:'person', confidence:0.95 }], metadata: { recognised, isAuthorized: recognised } };
          assert.equal(sortedMatchingRules(rules,event).length, expected ? 1 : 0, `${camera_id} ${day} ${time}`);
          if (expected) assert.equal(resolveAlertSeverity({ configuredSeverity: rule.severity, durationSeconds: 0 }), 'P1');
          checks++;
        }
      }
    }
  }
  const { rows: [{ count }] } = await pool.query(`SELECT count(*)::int AS count FROM alert_suppression_config WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND (detection_type='person' OR detection_type IS NULL) AND suppressed`);
  assert.equal(count, 0);
  console.log(JSON.stringify({verified:true,cameras:cameras.length,scheduleChecks:checks,knownAndUnknownPersons:true,severity:'P1',window:'20:00-08:00 Asia/Kolkata',syntheticAlertsCreated:0}));
} finally { await pool.end(); }
