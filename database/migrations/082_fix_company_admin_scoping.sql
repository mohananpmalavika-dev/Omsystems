-- Migration 082: Fix Company Admin Scope and Prevent Cross-Organization Leakage
-- Enforces:
-- 1. Company admins (role = 'company_admin') are scoped strictly to their assigned company node and its descendants.
-- 2. Super admins (super_admin, superadmin, mgdhanyamohan, user-global-admin) retain full global access across all companies.
-- 3. Removes unconditional tenant-wide bypass for company_admin in check_camera_access.

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
  v_specific_grant grant_effect;
BEGIN
  -- Get user details
  SELECT u.*
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'User not found', false;
    RETURN;
  END IF;

  -- Super admins have unconditional access to all cameras across all branches and tenants
  IF v_user.role::text IN ('super_admin', 'superadmin')
     OR v_user.identity_subject = 'user-global-admin'
     OR LOWER(COALESCE(v_user.username, '')) IN ('user-global-admin', 'mgdhanyamohan')
     OR v_user.id = '00000000-0000-4000-8000-000000000001'::uuid THEN
    RETURN QUERY SELECT true, 'Super admin access', false;
    RETURN;
  END IF;

  -- Check if user account is active
  IF v_user.status NOT IN ('active', 'pending_activation') AND v_user.active IS FALSE THEN
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

  -- Check tenant boundary
  IF v_camera.camera_tenant_id <> v_user.tenant_id THEN
    RETURN QUERY SELECT false, 'Camera belongs to different tenant', false;
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

  -- Check hierarchical access via access_grants
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
    RETURN QUERY SELECT true, 'Hierarchical access granted via access_grants', false;
    RETURN;
  END IF;

  -- Check hierarchical access via user_organizational_assignments
  SELECT EXISTS (
    SELECT 1
    FROM user_organizational_assignments uoa
    JOIN resource_nodes scope_node ON uoa.scope_node_id = scope_node.id
    WHERE uoa.user_id = p_user_id
      AND v_camera.camera_path <@ scope_node.path
  ) INTO v_hierarchical_access;

  IF v_hierarchical_access THEN
    RETURN QUERY SELECT true, 'Hierarchical access granted via organizational assignment', false;
    RETURN;
  END IF;

  -- Default deny: camera is outside the user's assigned branch, zone, or company scope
  RETURN QUERY SELECT false, 'Access denied: camera is outside user assigned organization scope', false;
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE;
