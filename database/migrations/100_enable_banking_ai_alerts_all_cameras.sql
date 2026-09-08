-- Enable every supported banking AI alert on each existing camera.
-- New cameras receive the identical bundle through camera-ai-bundle.ts.
WITH banking_bundle(name, detection_type, object_classes, min_confidence, min_duration_seconds, severity, cooldown_seconds) AS (
  VALUES
    ('Banking AI - Person in vault after hours', 'person-in-vault-after-hours', '["person"]'::jsonb, 0.65, 0.0, 'P1', 30),
    ('Banking AI - Cash counter monitoring', 'cash-counter-monitoring', '["person"]'::jsonb, 0.65, 0.0, 'P2', 60),
    ('Banking AI - Teller presence', 'teller-presence', '["person"]'::jsonb, 0.65, 30.0, 'P3', 120),
    ('Banking AI - Vault door monitoring', 'vault-door-monitoring', '[]'::jsonb, 0.65, 0.0, 'P1', 30),
    ('Banking AI - ATM queue', 'atm-queue', '["person"]'::jsonb, 0.65, 60.0, 'P3', 120),
    ('Banking AI - ATM tampering', 'atm-tampering', '[]'::jsonb, 0.75, 1.0, 'P1', 30),
    ('Banking AI - ATM skimming', 'atm-skimming', '[]'::jsonb, 0.75, 1.0, 'P1', 30),
    ('Banking AI - Cash van arrival', 'cash-van-arrival', '["vehicle"]'::jsonb, 0.65, 0.0, 'P3', 120),
    ('Banking AI - Strong room entry', 'strong-room-entry', '["person"]'::jsonb, 0.65, 0.0, 'P1', 30),
    ('Banking AI - Cash tray left open', 'cash-tray-left-open', '[]'::jsonb, 0.65, 5.0, 'P1', 30),
    ('Banking AI - Dual control verification', 'dual-control-verification', '["person"]'::jsonb, 0.65, 0.0, 'P1', 30)
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
  'protect-window', 30, 120, actor.id
FROM cameras camera
JOIN resource_nodes node ON node.id = camera.resource_node_id
CROSS JOIN banking_bundle bundle
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

-- A previous operator may have disabled an existing banking rule. Restore the
-- intended enabled state without changing its evidence or alert history.
UPDATE analytics_rules
SET enabled = true, updated_at = now()
WHERE detection_type IN (
  'person-in-vault-after-hours', 'cash-counter-monitoring', 'teller-presence',
  'vault-door-monitoring', 'atm-queue', 'atm-tampering', 'atm-skimming',
  'cash-van-arrival', 'strong-room-entry', 'cash-tray-left-open',
  'dual-control-verification'
)
  AND archived_at IS NULL;
