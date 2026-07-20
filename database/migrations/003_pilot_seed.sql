-- Idempotent pilot hierarchy used for physical-camera acceptance testing.
-- Replace these display names through the control plane before wider rollout.

INSERT INTO tenants (id, slug, name)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'omsystems-pilot',
  'OM Systems Pilot'
)
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug, name = EXCLUDED.name;

INSERT INTO resource_nodes
  (id, tenant_id, parent_id, node_type, name, path)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'company',
    'OM Systems',
    'company'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'division',
    'Operations',
    'company.operations'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000102',
    'region',
    'Local Region',
    'company.operations.local_region'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000103',
    'branch',
    'Local Camera Pilot',
    'company.operations.local_region.local_camera_pilot'
  )
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  parent_id = EXCLUDED.parent_id,
  node_type = EXCLUDED.node_type,
  name = EXCLUDED.name,
  path = EXCLUDED.path;

INSERT INTO users
  (id, tenant_id, identity_subject, display_name, active)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  'user-global-admin',
  'Pilot Administrator',
  true
)
ON CONFLICT (tenant_id, identity_subject) DO UPDATE
SET display_name = EXCLUDED.display_name, active = true;

INSERT INTO access_grants
  (tenant_id, user_id, scope_node_id, action, effect)
SELECT
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  action,
  'allow'
FROM unnest(ARRAY[
  'live:view',
  'recording:view',
  'evidence:export',
  'ptz:operate',
  'alarm:acknowledge',
  'device:configure',
  'user:manage',
  'audit:view'
]) AS action
WHERE NOT EXISTS (
  SELECT 1
  FROM access_grants existing
  WHERE existing.user_id = '00000000-0000-4000-8000-000000000201'
    AND existing.scope_node_id = '00000000-0000-4000-8000-000000000101'
    AND existing.action = action
    AND existing.effect = 'allow'
);
