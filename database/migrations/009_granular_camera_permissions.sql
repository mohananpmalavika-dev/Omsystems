-- Granular Camera Permission System
-- Runs after employee authentication and role data are available.
-- Implements camera-specific access control with deny rules for sensitive locations

-- Camera sensitivity levels
CREATE TYPE camera_sensitivity_level AS ENUM (
  'public',           -- Publicly accessible areas (parking, entrance)
  'internal',         -- Internal areas (corridors, lobby)
  'restricted',       -- Restricted areas (cash counter, vault entrance)
  'highly_restricted', -- Highly restricted (strong room, manager cabin)
  'sensitive'         -- Sensitive areas (locker room, changing room, restroom)
);

-- Add sensitivity and access control fields to cameras
ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS sensitivity_level camera_sensitivity_level NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_justification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_deny_roles jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_roles jsonb DEFAULT '[]'::jsonb;

-- Camera-specific access grants (overrides hierarchical permissions)
CREATE TABLE camera_specific_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  effect grant_effect NOT NULL,
  reason text,
  granted_by_user_id uuid REFERENCES users(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (user_id, camera_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX camera_specific_grants_user_idx ON camera_specific_grants (user_id);
CREATE INDEX camera_specific_grants_camera_idx ON camera_specific_grants (camera_id);
CREATE INDEX camera_specific_grants_validity_idx 
  ON camera_specific_grants (valid_from, valid_until);

-- Temporary camera access requests (for restricted cameras)
CREATE TYPE access_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'expired',
  'revoked'
);

CREATE TABLE camera_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  justification text NOT NULL,
  requested_from timestamptz NOT NULL,
  requested_until timestamptz NOT NULL,
  status access_request_status NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (requested_until > requested_from)
);

CREATE INDEX camera_access_requests_user_idx ON camera_access_requests (user_id);
CREATE INDEX camera_access_requests_camera_idx ON camera_access_requests (camera_id);
CREATE INDEX camera_access_requests_status_idx ON camera_access_requests (status);
CREATE INDEX camera_access_requests_pending_idx 
  ON camera_access_requests (tenant_id, status) 
  WHERE status = 'pending';

-- Time-based access restrictions
CREATE TABLE time_based_access_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  camera_id uuid REFERENCES cameras(id) ON DELETE CASCADE,
  scope_node_id uuid REFERENCES resource_nodes(id) ON DELETE CASCADE,
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  time_from time NOT NULL,
  time_until time NOT NULL,
  effect grant_effect NOT NULL DEFAULT 'deny',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (
    (camera_id IS NOT NULL AND scope_node_id IS NULL) OR
    (camera_id IS NULL AND scope_node_id IS NOT NULL)
  ),
  CHECK (time_until > time_from OR (time_until < time_from)) -- Allow overnight restrictions
);

CREATE INDEX time_restrictions_camera_idx ON time_based_access_restrictions (camera_id);
CREATE INDEX time_restrictions_scope_idx ON time_based_access_restrictions (scope_node_id);
CREATE INDEX time_restrictions_dow_idx ON time_based_access_restrictions (day_of_week);

-- Camera access groups for bulk permission management
CREATE TABLE camera_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  scope_node_id uuid REFERENCES resource_nodes(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, name)
);

CREATE INDEX camera_access_groups_tenant_idx ON camera_access_groups (tenant_id);
CREATE INDEX camera_access_groups_scope_idx ON camera_access_groups (scope_node_id);

-- Cameras in access groups
CREATE TABLE camera_access_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES camera_access_groups(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by_user_id uuid REFERENCES users(id),
  
  UNIQUE (access_group_id, camera_id)
);

CREATE INDEX camera_group_members_group_idx ON camera_access_group_members (access_group_id);
CREATE INDEX camera_group_members_camera_idx ON camera_access_group_members (camera_id);

-- Users assigned to access groups
CREATE TABLE user_access_group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES camera_access_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effect grant_effect NOT NULL DEFAULT 'allow',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id uuid REFERENCES users(id),
  
  UNIQUE (access_group_id, user_id)
);

CREATE INDEX user_group_assignments_group_idx ON user_access_group_assignments (access_group_id);
CREATE INDEX user_group_assignments_user_idx ON user_access_group_assignments (user_id);

-- Enhanced access check function with camera-specific rules
CREATE OR REPLACE FUNCTION check_camera_access(
  p_user_id uuid,
  p_camera_id uuid,
  p_action text DEFAULT 'live:view'
) RETURNS TABLE (
  allowed boolean,
  reason text,
  requires_approval boolean
) AS $$
DECLARE
  v_user RECORD;
  v_camera RECORD;
  v_hierarchical_access boolean := false;
  v_hierarchical_deny boolean := false;
  v_specific_grant grant_effect;
  v_time_restricted boolean := false;
  v_group_access boolean := false;
  v_group_deny boolean := false;
BEGIN
  -- Get user details
  SELECT u.*, uoa.scope_node_id as primary_scope
  INTO v_user
  FROM users u
  LEFT JOIN user_organizational_assignments uoa 
    ON u.id = uoa.user_id AND uoa.is_primary = true
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'User not found', false;
    RETURN;
  END IF;

  -- Check if user is active
  IF v_user.status != 'active' THEN
    RETURN QUERY SELECT false, 'User account is not active', false;
    RETURN;
  END IF;

  -- Get camera details
  SELECT c.*, rn.path as camera_path, rn.tenant_id as camera_tenant_id
  INTO v_camera
  FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  WHERE c.id = p_camera_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Camera not found', false;
    RETURN;
  END IF;

  IF v_camera.camera_tenant_id <> v_user.tenant_id THEN
    RETURN QUERY SELECT false, 'Camera not found', false;
    RETURN;
  END IF;

  -- Super admins have access to everything
  IF v_user.role = 'super_admin' THEN
    RETURN QUERY SELECT true, 'Super admin access', false;
    RETURN;
  END IF;

  -- Check camera-specific DENY grants (highest priority)
  SELECT csg.effect INTO v_specific_grant
  FROM camera_specific_grants csg
  WHERE csg.user_id = p_user_id
    AND csg.camera_id = p_camera_id
    AND csg.effect = 'deny'
    AND (csg.valid_from IS NULL OR csg.valid_from <= now())
    AND (csg.valid_until IS NULL OR csg.valid_until > now())
  LIMIT 1;

  IF v_specific_grant = 'deny' THEN
    RETURN QUERY SELECT false, 'Explicitly denied access to this camera', false;
    RETURN;
  END IF;

  -- Check if camera sensitivity level auto-denies this role
  IF v_camera.sensitivity_level = 'sensitive' AND 
     v_user.role NOT IN ('super_admin', 'company_admin', 'hq_admin') THEN
    RETURN QUERY SELECT false, 'Insufficient privileges for sensitive camera', true;
    RETURN;
  END IF;

  -- Check role-based auto-deny
  IF v_camera.auto_deny_roles ? v_user.role::text THEN
    RETURN QUERY SELECT false, 'Role is not permitted for this camera', true;
    RETURN;
  END IF;

  -- Check role-based allowed list (if specified)
  IF jsonb_array_length(v_camera.allowed_roles) > 0 AND 
     NOT (v_camera.allowed_roles ? v_user.role::text) THEN
    RETURN QUERY SELECT false, 'Role is not in allowed list for this camera', true;
    RETURN;
  END IF;

  -- Check time-based restrictions
  SELECT EXISTS (
    SELECT 1
    FROM time_based_access_restrictions tbr
    LEFT JOIN resource_nodes restricted_scope
      ON restricted_scope.id = tbr.scope_node_id
    WHERE (
        tbr.camera_id = p_camera_id
        OR (
          tbr.scope_node_id IS NOT NULL
          AND v_camera.camera_path <@ restricted_scope.path
        )
      )
      AND tbr.is_active = true
      AND tbr.effect = 'deny'
      AND (tbr.day_of_week IS NULL OR tbr.day_of_week = EXTRACT(DOW FROM now()))
      AND (
        (tbr.time_from < tbr.time_until AND 
         CURRENT_TIME BETWEEN tbr.time_from AND tbr.time_until) OR
        (tbr.time_from > tbr.time_until AND 
         (CURRENT_TIME >= tbr.time_from OR CURRENT_TIME <= tbr.time_until))
      )
  ) INTO v_time_restricted;

  IF v_time_restricted THEN
    RETURN QUERY SELECT false, 'Access restricted during this time period', false;
    RETURN;
  END IF;

  -- A hierarchy-level deny cannot be bypassed by an allow group.
  SELECT EXISTS (
    SELECT 1
    FROM access_grants ag
    JOIN resource_nodes scope_node ON ag.scope_node_id = scope_node.id
    WHERE ag.user_id = p_user_id
      AND ag.action = p_action
      AND ag.effect = 'deny'
      AND v_camera.camera_path <@ scope_node.path
      AND (ag.valid_from IS NULL OR ag.valid_from <= now())
      AND (ag.valid_until IS NULL OR ag.valid_until > now())
  ) INTO v_hierarchical_deny;

  IF v_hierarchical_deny THEN
    RETURN QUERY SELECT false, 'Denied by organizational access policy', false;
    RETURN;
  END IF;

  -- Check camera-specific ALLOW grants
  SELECT csg.effect INTO v_specific_grant
  FROM camera_specific_grants csg
  WHERE csg.user_id = p_user_id
    AND csg.camera_id = p_camera_id
    AND csg.effect = 'allow'
    AND (csg.valid_from IS NULL OR csg.valid_from <= now())
    AND (csg.valid_until IS NULL OR csg.valid_until > now())
  LIMIT 1;

  IF v_specific_grant = 'allow' THEN
    RETURN QUERY SELECT true, 'Explicit camera access granted', false;
    RETURN;
  END IF;

  -- An explicit group deny has priority over group/hierarchy allows.
  SELECT EXISTS (
    SELECT 1
    FROM user_access_group_assignments uaga
    JOIN camera_access_group_members cagm ON uaga.access_group_id = cagm.access_group_id
    JOIN camera_access_groups cag ON uaga.access_group_id = cag.id
    WHERE uaga.user_id = p_user_id
      AND cagm.camera_id = p_camera_id
      AND uaga.effect = 'deny'
      AND cag.is_active = true
  ) INTO v_group_deny;

  IF v_group_deny THEN
    RETURN QUERY SELECT false, 'Denied by camera access group', false;
    RETURN;
  END IF;

  -- Check access group membership
  SELECT EXISTS (
    SELECT 1
    FROM user_access_group_assignments uaga
    JOIN camera_access_group_members cagm ON uaga.access_group_id = cagm.access_group_id
    JOIN camera_access_groups cag ON uaga.access_group_id = cag.id
    WHERE uaga.user_id = p_user_id
      AND cagm.camera_id = p_camera_id
      AND uaga.effect = 'allow'
      AND cag.is_active = true
  ) INTO v_group_access;

  IF v_group_access THEN
    RETURN QUERY SELECT true, 'Access via camera access group', false;
    RETURN;
  END IF;

  -- Check hierarchical access via access_grants.
  SELECT EXISTS (
    SELECT 1
    FROM access_grants ag
    JOIN resource_nodes scope_node ON ag.scope_node_id = scope_node.id
    WHERE ag.user_id = p_user_id
      AND ag.action = p_action
      AND ag.effect = 'allow'
      AND v_camera.camera_path <@ scope_node.path
      AND (ag.valid_from IS NULL OR ag.valid_from <= now())
      AND (ag.valid_until IS NULL OR ag.valid_until > now())
  ) INTO v_hierarchical_access;

  IF v_hierarchical_access THEN
    -- Check if approval required for restricted cameras
    IF v_camera.requires_approval AND v_camera.sensitivity_level IN ('restricted', 'highly_restricted') THEN
      -- Check if there's an approved access request
      IF EXISTS (
        SELECT 1
        FROM camera_access_requests car
        WHERE car.user_id = p_user_id
          AND car.camera_id = p_camera_id
          AND car.status = 'approved'
          AND car.requested_from <= now()
          AND car.requested_until > now()
      ) THEN
        RETURN QUERY SELECT true, 'Hierarchical access with approved request', false;
        RETURN;
      ELSE
        RETURN QUERY SELECT false, 'Access request required for this camera', true;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT true, 'Hierarchical access granted', false;
      RETURN;
    END IF;
  END IF;

  -- Default deny
  RETURN QUERY SELECT false, 'No access granted', v_camera.requires_approval;
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to auto-expire access requests
CREATE OR REPLACE FUNCTION expire_access_requests()
RETURNS void AS $$
BEGIN
  UPDATE camera_access_requests
  SET status = 'expired'
  WHERE status IN ('pending', 'approved')
    AND requested_until < now();
END;
$$ LANGUAGE plpgsql;

-- View for camera access summary
CREATE VIEW camera_access_summary AS
SELECT 
  c.id as camera_id,
  rn.name as camera_name,
  c.sensitivity_level,
  c.requires_approval,
  bn.name as branch_name,
  c.location_type,
  -- Count of users with explicit access
  (SELECT COUNT(DISTINCT csg.user_id)
   FROM camera_specific_grants csg
   WHERE csg.camera_id = c.id
     AND csg.effect = 'allow'
     AND (csg.valid_until IS NULL OR csg.valid_until > now())) as explicit_access_count,
  -- Count of users explicitly denied
  (SELECT COUNT(DISTINCT csg.user_id)
   FROM camera_specific_grants csg
   WHERE csg.camera_id = c.id
     AND csg.effect = 'deny'
     AND (csg.valid_until IS NULL OR csg.valid_until > now())) as explicit_deny_count,
  -- Count of pending access requests
  (SELECT COUNT(*)
   FROM camera_access_requests car
   WHERE car.camera_id = c.id
     AND car.status = 'pending') as pending_requests_count,
  -- Time restrictions
  (SELECT COUNT(*)
   FROM time_based_access_restrictions tbr
   WHERE tbr.camera_id = c.id
     AND tbr.is_active = true) as time_restrictions_count,
  c.created_at
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
JOIN resource_nodes bn ON c.branch_node_id = bn.id;

-- View for user camera access overview
CREATE VIEW user_camera_access_overview AS
SELECT 
  u.id as user_id,
  u.display_name,
  u.email,
  u.role,
  -- Count of explicitly allowed cameras
  (SELECT COUNT(DISTINCT csg.camera_id)
   FROM camera_specific_grants csg
   WHERE csg.user_id = u.id
     AND csg.effect = 'allow'
     AND (csg.valid_until IS NULL OR csg.valid_until > now())) as explicit_allow_count,
  -- Count of explicitly denied cameras
  (SELECT COUNT(DISTINCT csg.camera_id)
   FROM camera_specific_grants csg
   WHERE csg.user_id = u.id
     AND csg.effect = 'deny'
     AND (csg.valid_until IS NULL OR csg.valid_until > now())) as explicit_deny_count,
  -- Count of cameras accessible via groups
  (SELECT COUNT(DISTINCT cagm.camera_id)
   FROM user_access_group_assignments uaga
   JOIN camera_access_group_members cagm ON uaga.access_group_id = cagm.access_group_id
   WHERE uaga.user_id = u.id
     AND uaga.effect = 'allow') as group_access_count,
  -- Count of pending requests
  (SELECT COUNT(*)
   FROM camera_access_requests car
   WHERE car.user_id = u.id
     AND car.status = 'pending') as pending_requests_count,
  -- Count of approved temporary accesses
  (SELECT COUNT(*)
   FROM camera_access_requests car
   WHERE car.user_id = u.id
     AND car.status = 'approved'
     AND car.requested_from <= now()
     AND car.requested_until > now()) as active_temporary_access_count
FROM users u
WHERE u.active = true;

-- Trigger to update camera_access_groups updated_at
CREATE TRIGGER update_camera_access_groups_updated_at
  BEFORE UPDATE ON camera_access_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE camera_specific_grants IS 
  'Camera-level access grants that override hierarchical permissions';

COMMENT ON TABLE camera_access_requests IS 
  'Requests for temporary access to restricted cameras with justification';

COMMENT ON TABLE time_based_access_restrictions IS 
  'Time-based access restrictions for cameras or organizational nodes';

COMMENT ON TABLE camera_access_groups IS 
  'Named groups of cameras for bulk permission management';

COMMENT ON FUNCTION check_camera_access IS 
  'Comprehensive camera access check considering all permission layers: specific grants, sensitivity, time restrictions, groups, and hierarchy';

COMMENT ON COLUMN cameras.sensitivity_level IS 
  'Camera sensitivity level determining default access restrictions';

COMMENT ON COLUMN cameras.requires_approval IS 
  'Whether access to this camera requires explicit approval even with hierarchical permissions';

COMMENT ON COLUMN cameras.auto_deny_roles IS 
  'JSON array of roles that are automatically denied access to this camera';

COMMENT ON COLUMN cameras.allowed_roles IS 
  'JSON array of roles allowed to access this camera (empty = all roles allowed by other rules)';
