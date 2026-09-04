-- Enable the detector-backed camera AI bundle for existing and future cameras.
-- Capability IDs are validated by the application catalog, so the original
-- small hard-coded SQL enum prevented newer detectors from being provisioned.

ALTER TABLE analytics_rules
  DROP CONSTRAINT IF EXISTS analytics_rules_detection_type_check;

ALTER TABLE analytics_rules
  ADD CONSTRAINT analytics_rules_detection_type_length_check
  CHECK (length(detection_type) BETWEEN 1 AND 120);

ALTER TABLE analytics_rules
  ALTER COLUMN created_by DROP NOT NULL;

WITH bundle(name, detection_type, object_classes, min_confidence, min_duration_seconds, severity, cooldown_seconds) AS (
  VALUES
    ('AI - Motion detection', 'motion', '[]'::jsonb, 0.65, 1.0, 'P4', 30),
    ('AI - Object detection', 'object', '[]'::jsonb, 0.65, 0.0, 'P4', 60),
    ('AI - Person detection', 'person', '["person"]'::jsonb, 0.65, 0.0, 'P3', 60),
    ('AI - Vehicle detection', 'vehicle', '["car","truck","bus","motorcycle","bicycle","auto-rickshaw"]'::jsonb, 0.65, 0.0, 'P3', 60),
    ('AI - Fire detection', 'fire', '["fire"]'::jsonb, 0.70, 1.0, 'P1', 30),
    ('AI - Smoke detection', 'smoke', '["smoke"]'::jsonb, 0.70, 1.0, 'P1', 30),
    ('AI - Fall detection', 'fall', '["person"]'::jsonb, 0.70, 1.0, 'P1', 30),
    ('AI - Helmet worn inside bank', 'helmet-worn', '["helmet","person"]'::jsonb, 0.70, 1.0, 'P2', 60),
    ('AI - Crowd density', 'crowd-density', '["person"]'::jsonb, 0.65, 4.0, 'P2', 120),
    ('AI - Tailgating', 'tailgating', '["person"]'::jsonb, 0.65, 0.0, 'P2', 60),
    ('AI - Queue analysis', 'queue', '["person"]'::jsonb, 0.65, 5.0, 'P3', 120),
    ('AI - Camera tampering', 'camera-tampering', '[]'::jsonb, 0.65, 1.0, 'P1', 30),
    ('AI - Video loss', 'video-loss', '[]'::jsonb, 0.65, 1.0, 'P1', 30),
    ('AI - Face detection', 'face', '["face"]'::jsonb, 0.75, 0.0, 'P4', 300),
    ('AI - Number plate recognition', 'anpr', '["license-plate"]'::jsonb, 0.75, 0.0, 'P4', 300)
)
INSERT INTO analytics_rules (
  tenant_id, camera_id, name, detection_type, enabled, object_classes,
  min_confidence, min_duration_seconds, direction, severity,
  cooldown_seconds, recipients, recording_policy, pre_roll_seconds,
  post_roll_seconds, created_by
)
SELECT
  node.tenant_id, camera.id, bundle.name, bundle.detection_type, true,
  bundle.object_classes, bundle.min_confidence, bundle.min_duration_seconds,
  'any', bundle.severity, bundle.cooldown_seconds, '[]'::jsonb,
  'event-recording', 30, 120, actor.id
FROM cameras camera
JOIN resource_nodes node ON node.id = camera.resource_node_id
CROSS JOIN bundle
LEFT JOIN LATERAL (
  SELECT users.id
  FROM users
  WHERE users.tenant_id = node.tenant_id
  ORDER BY users.created_at
  LIMIT 1
) actor ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM analytics_rules existing
  WHERE existing.camera_id = camera.id
    AND existing.detection_type = bundle.detection_type
    AND existing.archived_at IS NULL
);

COMMENT ON COLUMN analytics_rules.created_by IS
  'User that configured the rule; NULL identifies zero-touch system provisioning.';
