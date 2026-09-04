-- ==============================================================================
-- 096: Enable All 37 NBFC Visual Rules Subsystem Across All Cameras
-- ==============================================================================

-- 1. Ensure tmpl-37 (Helmet / Face Cover Inside Branch/ATM) is seeded
INSERT INTO nbfc_rule_templates (
  id, name, category, description, detector_type, default_condition,
  default_duration_ms, default_severity, default_cooldown_ms, default_actions,
  recommended_zone_types, suggested_schedule, metadata
) VALUES (
  'tmpl-37-helmet-face-cover',
  'Helmet / Face Cover Inside Branch/ATM',
  'ACCESS_PERIMETER',
  'Detects persons entering branch lobby, ATM kiosk, cash counter, or vault area wearing a motorcycle helmet, full-face visor, or concealment gear.',
  'helmet-worn',
  '{"metric": "helmet_detected", "value": true, "operator": "EQUALS"}'::jsonb,
  1000,
  'HIGH',
  60000,
  '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "POPUP_LIVE_VIEW"]'::jsonb,
  '["ENTRANCE", "ATM_AREA", "CASH_COUNTER", "LOCKER", "CUSTOMER_AREA"]'::jsonb,
  '24X7',
  '{"threatType": "identity_concealment", "securityMandate": "RBI_NBFC_PHYSICAL_SECURITY"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  detector_type = EXCLUDED.detector_type,
  default_condition = EXCLUDED.default_condition,
  default_severity = EXCLUDED.default_severity;

-- 2. Normalize template severities to standard enum
UPDATE nbfc_rule_templates SET default_severity = 'MEDIUM' WHERE default_severity = 'WARNING';

-- 3. Bulk instantiate all 37 NBFC rules for all active tenants with Global scope (All Cameras)
INSERT INTO nbfc_analytics_rules (
  id, tenant_id, name, description, enabled, state,
  branch_ids, camera_ids, zone_id, detector_type, condition,
  duration_ms, schedule_id, schedule, severity, cooldown_ms,
  actions, version, template_id, scope_type, parent_rule_id,
  created_by, created_at, updated_by, updated_at
)
SELECT
  gen_random_uuid(),
  t.id AS tenant_id,
  tmpl.name,
  tmpl.description,
  true AS enabled,
  'ACTIVE' AS state,
  '[]'::jsonb AS branch_ids,
  '[]'::jsonb AS camera_ids,
  NULL::uuid AS zone_id,
  tmpl.detector_type,
  tmpl.default_condition AS condition,
  tmpl.default_duration_ms AS duration_ms,
  NULL::uuid AS schedule_id,
  jsonb_build_object('type', tmpl.suggested_schedule) AS schedule,
  CASE WHEN tmpl.default_severity = 'WARNING' THEN 'MEDIUM' ELSE tmpl.default_severity END AS severity,
  tmpl.default_cooldown_ms AS cooldown_ms,
  tmpl.default_actions AS actions,
  1 AS version,
  tmpl.id AS template_id,
  'GLOBAL' AS scope_type,
  NULL::uuid AS parent_rule_id,
  'system-admin' AS created_by,
  NOW() AS created_at,
  'system-admin' AS updated_by,
  NOW() AS updated_at
FROM nbfc_rule_templates tmpl
CROSS JOIN tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM nbfc_analytics_rules r
  WHERE r.tenant_id = t.id AND r.template_id = tmpl.id
);

-- 4. Record version 1 snapshots in nbfc_rule_versions
INSERT INTO nbfc_rule_versions (
  id, rule_id, version, rule_snapshot, change_reason, changed_by, created_at
)
SELECT
  gen_random_uuid(),
  r.id,
  r.version,
  to_jsonb(r),
  'Bulk enabled all NBFC rules for all cameras',
  r.created_by,
  r.created_at
FROM nbfc_analytics_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM nbfc_rule_versions v
  WHERE v.rule_id = r.id AND v.version = r.version
);

-- 5. Ensure all existing and newly created NBFC rules are set to ACTIVE and enabled
UPDATE nbfc_analytics_rules
SET enabled = true, state = 'ACTIVE', updated_at = NOW();

-- 6. Ensure all camera-level detector rules across all cameras are active (excluding deprecated no-helmet)
UPDATE analytics_rules
SET enabled = true, updated_at = NOW()
WHERE detection_type != 'no-helmet';
