-- Make branch-opening dual control operational and configurable per branch.
-- Physical locks remain under approved access-control workflows; this policy
-- creates a P1 alert, incident and evidence package when fewer than two people
-- are visible during the configured opening window.

UPDATE nbfc_rule_templates
SET
  name = 'Branch Opening Two-Person Enforcement',
  description = 'Requires two people to be visible together during the configured branch opening window and escalates non-compliance with evidence.',
  default_condition = '{"metric":"staff_count","operator":"LESS_THAN","value":2}'::jsonb,
  default_duration_ms = 30000,
  default_severity = 'CRITICAL',
  default_cooldown_ms = 600000,
  default_actions = '["CREATE_ALERT","CREATE_INCIDENT","CAPTURE_SNAPSHOT","CAPTURE_EVIDENCE_CLIP","NOTIFY_SOC","NOTIFY_BRANCH_MANAGER"]'::jsonb,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"requiredOpeningStaff":2,"defaultOpeningStart":"08:30","defaultOpeningEnd":"09:30","enforcementMode":"ALERT_EVIDENCE_AND_INCIDENT"}'::jsonb
WHERE id = 'tmpl-27-opening-staff-count';

UPDATE nbfc_analytics_rules
SET
  name = 'Branch Opening Two-Person Enforcement',
  description = 'Requires two people to be visible together during the configured branch opening window and escalates non-compliance with evidence.',
  enabled = true,
  state = 'ACTIVE',
  condition = '{"metric":"staff_count","operator":"LESS_THAN","value":2}'::jsonb,
  duration_ms = 30000,
  schedule = jsonb_build_object(
    'type', 'BRANCH_OPENING',
    'start', COALESCE(schedule->>'start', '08:30'),
    'end', COALESCE(schedule->>'end', '09:30'),
    'timezone', COALESCE(schedule->>'timezone', 'Asia/Kolkata'),
    'days', COALESCE(schedule->'days', '[1,2,3,4,5,6]'::jsonb)
  ),
  severity = 'CRITICAL',
  cooldown_ms = 600000,
  actions = '["CREATE_ALERT","CREATE_INCIDENT","CAPTURE_SNAPSHOT","CAPTURE_EVIDENCE_CLIP","NOTIFY_SOC","NOTIFY_BRANCH_MANAGER"]'::jsonb,
  updated_at = NOW()
WHERE template_id = 'tmpl-27-opening-staff-count';

-- Derived violations can occur with zero people in frame. Do not require a
-- person object on the synthetic dual-control event.
UPDATE analytics_rules
SET object_classes = '[]'::jsonb, severity = 'P1', recording_policy = 'protect-window', updated_at = NOW()
WHERE detection_type = 'dual-control-verification'
  AND archived_at IS NULL;
