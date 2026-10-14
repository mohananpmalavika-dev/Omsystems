import assert from 'node:assert/strict';
import pg from 'pg';
import { AlertSuppressionService } from '/app/dist/src/alerts/services/alert-suppression.service.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const service = new AlertSuppressionService(pool);
  const { rows: scopes } = await pool.query('SELECT tenant_id,branch_id,camera_id FROM alert_suppression_config WHERE detection_type IS NULL');
  assert.ok(scopes.length > 0);
  const results = [];
  for (const scope of scopes) {
    for (const type of ['helmet-worn', 'person', 'face-recognition', 'dual-control-verification', 'fire', 'CAMERA_HEALTH_FAULT', 'future-alert-type']) {
      const result = await service.isSuppressed(scope.tenant_id, scope.branch_id ?? 'verification-branch', scope.camera_id ?? 'verification-camera', type);
      assert.equal(result.suppressed, type !== 'helmet-worn', `Wrong suppression result for ${type}`);
      results.push({ detectionType: type, suppressed: result.suppressed });
    }
  }
  const { rows: [summary] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM analytics_rules WHERE enabled AND detection_type='helmet-worn' AND archived_at IS NULL) AS helmet_rules_enabled,
    (SELECT count(*)::int FROM analytics_rules WHERE enabled AND detection_type IS DISTINCT FROM 'helmet-worn') AS other_rules_enabled,
    (SELECT count(*)::int FROM nbfc_analytics_rules WHERE enabled AND detector_type IS DISTINCT FROM 'helmet-worn') AS other_nbfc_rules_enabled,
    (SELECT count(*)::int FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
      WHERE r.detection_type IS DISTINCT FROM 'helmet-worn' AND a.status IN ('new','acknowledged','investigating','escalated')) AS active_other_alerts,
    (SELECT count(*)::int FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id JOIN analytics_rules r ON r.id=a.rule_id
      WHERE r.detection_type IS DISTINCT FROM 'helmet-worn' AND n.status IN ('queued','failed','processing')) AS pending_other_notifications,
    (SELECT count(*)::int FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
      WHERE r.detection_type IS DISTINCT FROM 'helmet-worn' AND a.created_at >
      (SELECT max(occurred_at) FROM audit_events WHERE action='alerts.helmet_only.configured')) AS other_alerts_created_after_change`);
  assert.equal(summary.helmet_rules_enabled, 41);
  for (const field of ['other_rules_enabled','other_nbfc_rules_enabled','active_other_alerts','pending_other_notifications','other_alerts_created_after_change']) assert.equal(summary[field],0,field);
  console.log(JSON.stringify({ verified: true, summary, runtimeSuppressionChecks: results }, null, 2));
} finally {
  await pool.end();
}
