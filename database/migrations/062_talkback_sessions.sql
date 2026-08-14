ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'view';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_purpose_check'
  ) THEN
    ALTER TABLE live_sessions
      ADD CONSTRAINT live_sessions_purpose_check
      CHECK (purpose IN ('view', 'talk'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS live_sessions_talk_active_idx
  ON live_sessions (camera_id, expires_at)
  WHERE purpose = 'talk' AND consumed_at IS NULL;

WITH talk_permissions(role, resource_type, can_grant, description) AS (
  VALUES
    ('super_admin'::user_role, NULL::resource_node_type, true, 'Use two-way camera and recorder audio'),
    ('company_admin'::user_role, 'company'::resource_node_type, true, 'Use two-way audio at company level'),
    ('hq_admin'::user_role, 'headquarters'::resource_node_type, true, 'Use two-way audio at HQ level'),
    ('zone_manager'::user_role, 'zone'::resource_node_type, false, 'Use two-way audio at zone level'),
    ('region_manager'::user_role, 'region'::resource_node_type, false, 'Use two-way audio at region level'),
    ('area_manager'::user_role, 'area'::resource_node_type, false, 'Use two-way audio at area level'),
    ('branch_manager'::user_role, 'branch'::resource_node_type, false, 'Use two-way audio at branch level'),
    ('operator'::user_role, 'branch'::resource_node_type, false, 'Use two-way audio for assigned cameras'),
    ('security_officer'::user_role, 'branch'::resource_node_type, false, 'Use two-way audio for assigned cameras')
)
INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
SELECT role, 'audio:talk', resource_type, can_grant, description
FROM talk_permissions permission
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions existing
  WHERE existing.role = permission.role
    AND existing.action = 'audio:talk'
    AND existing.resource_type IS NOT DISTINCT FROM permission.resource_type
);

INSERT INTO access_grants (tenant_id, user_id, scope_node_id, action, effect, grant_source)
SELECT app_user.tenant_id, app_user.id, assignment.scope_node_id, 'audio:talk', 'allow', 'role'
FROM users app_user
JOIN user_organizational_assignments assignment ON assignment.user_id = app_user.id
JOIN role_permissions permission ON permission.role = app_user.role AND permission.action = 'audio:talk'
WHERE NOT EXISTS (
  SELECT 1 FROM access_grants existing
  WHERE existing.user_id = app_user.id
    AND existing.scope_node_id = assignment.scope_node_id
    AND existing.action = 'audio:talk'
    AND existing.effect = 'allow'
);
