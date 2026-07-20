-- Employee Management and Authentication System
-- Runs after the organizational hierarchy is available.
-- Enhances the users table with authentication, roles, and employee information

-- User roles enum
CREATE TYPE user_role AS ENUM (
  'super_admin',        -- Full system access
  'company_admin',      -- Company-level administrator
  'hq_admin',          -- Headquarters administrator
  'zone_manager',      -- Zone-level manager
  'region_manager',    -- Region-level manager
  'area_manager',      -- Area-level manager
  'branch_manager',    -- Branch-level manager
  'operator',          -- Standard operator with limited access
  'viewer',            -- Read-only access
  'security_officer',  -- Security-specific role
  'auditor'            -- Audit-only access
);

-- User status enum
CREATE TYPE user_status AS ENUM (
  'active',
  'inactive',
  'suspended',
  'pending_activation',
  'locked'
);

-- Enhance users table with authentication and employee information
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'pending_activation',
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS date_of_joining date,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS reporting_to_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS grant_source text NOT NULL DEFAULT 'manual'
  CHECK (grant_source IN ('manual', 'role'));

-- Create unique constraints
CREATE UNIQUE INDEX users_email_tenant_idx 
  ON users (tenant_id, LOWER(email)) 
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX users_username_tenant_idx 
  ON users (tenant_id, LOWER(username)) 
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX users_employee_id_tenant_idx 
  ON users (tenant_id, employee_id) 
  WHERE employee_id IS NOT NULL;

-- Create indexes for common queries
CREATE INDEX users_role_idx ON users (tenant_id, role);
CREATE INDEX users_status_idx ON users (tenant_id, status);
CREATE INDEX users_reporting_to_idx ON users (reporting_to_user_id);

-- User sessions table for authentication
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text NOT NULL UNIQUE,
  ip_address inet,
  user_agent text,
  access_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at);
CREATE INDEX user_sessions_tenant_idx ON user_sessions (tenant_id);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

-- Preserve the existing pilot/development identities when upgrading a running
-- installation. New accounts remain pending until explicitly activated.
UPDATE users
SET
  status = CASE WHEN active THEN 'active'::user_status ELSE 'inactive'::user_status END,
  role = CASE
    WHEN identity_subject = 'user-global-admin' THEN 'super_admin'::user_role
    ELSE role
  END,
  username = COALESCE(username, identity_subject)
WHERE username IS NULL OR status = 'pending_activation';

UPDATE access_grants
SET grant_source='role'
WHERE user_id IN (
  SELECT id FROM users WHERE identity_subject='user-global-admin'
);

-- User organizational assignments (users can be assigned to multiple org levels)
CREATE TABLE user_organizational_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id uuid REFERENCES users(id),
  
  UNIQUE (user_id, scope_node_id)
);

CREATE INDEX user_org_assignments_user_idx ON user_organizational_assignments (user_id);
CREATE INDEX user_org_assignments_scope_idx ON user_organizational_assignments (scope_node_id);
CREATE INDEX user_org_assignments_primary_idx ON user_organizational_assignments (user_id, is_primary);

-- Ensure only one primary assignment per user
CREATE UNIQUE INDEX user_org_assignments_primary_unique_idx 
  ON user_organizational_assignments (user_id) 
  WHERE is_primary = true;

-- Give pre-existing pilot users a primary company scope so the new hierarchy
-- and camera-specific permission engine can evaluate their existing grants.
INSERT INTO user_organizational_assignments (
  user_id, tenant_id, scope_node_id, is_primary, assigned_by_user_id
)
SELECT u.id, u.tenant_id, company.id, true, u.id
FROM users u
JOIN LATERAL (
  SELECT rn.id
  FROM resource_nodes rn
  WHERE rn.tenant_id = u.tenant_id
    AND rn.node_type = 'company'
  ORDER BY rn.created_at
  LIMIT 1
) company ON true
WHERE u.identity_subject = 'user-global-admin'
ON CONFLICT (user_id, scope_node_id) DO UPDATE SET is_primary = true;

-- Role-based permissions template
CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  action text NOT NULL,
  resource_type resource_node_type,
  can_grant boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (role, action, resource_type)
);

-- Insert default role permissions
INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
VALUES
  -- Super Admin - Full access
  ('super_admin', 'live:view', NULL, true, 'View live camera feeds'),
  ('super_admin', 'recording:view', NULL, true, 'View recorded footage'),
  ('super_admin', 'evidence:export', NULL, true, 'Export evidence'),
  ('super_admin', 'ptz:operate', NULL, true, 'Operate PTZ cameras'),
  ('super_admin', 'alarm:acknowledge', NULL, true, 'Acknowledge alarms'),
  ('super_admin', 'device:configure', NULL, true, 'Configure devices'),
  ('super_admin', 'user:manage', NULL, true, 'Manage users'),
  ('super_admin', 'audit:view', NULL, true, 'View audit logs'),
  ('super_admin', 'org:manage', NULL, true, 'Manage organizational structure'),
  
  -- Company Admin
  ('company_admin', 'live:view', 'company', true, 'View live camera feeds at company level'),
  ('company_admin', 'recording:view', 'company', true, 'View recorded footage'),
  ('company_admin', 'evidence:export', 'company', true, 'Export evidence'),
  ('company_admin', 'device:configure', 'company', true, 'Configure devices'),
  ('company_admin', 'user:manage', 'company', true, 'Manage users'),
  ('company_admin', 'audit:view', 'company', true, 'View audit logs'),
  ('company_admin', 'org:manage', 'company', true, 'Manage organizational structure'),
  
  -- HQ Admin
  ('hq_admin', 'live:view', 'headquarters', true, 'View live camera feeds at HQ level'),
  ('hq_admin', 'recording:view', 'headquarters', true, 'View recorded footage'),
  ('hq_admin', 'evidence:export', 'headquarters', true, 'Export evidence'),
  ('hq_admin', 'device:configure', 'headquarters', true, 'Configure devices'),
  ('hq_admin', 'user:manage', 'headquarters', false, 'Manage users'),
  ('hq_admin', 'audit:view', 'headquarters', false, 'View audit logs'),
  
  -- Zone Manager
  ('zone_manager', 'live:view', 'zone', false, 'View live camera feeds at zone level'),
  ('zone_manager', 'recording:view', 'zone', false, 'View recorded footage'),
  ('zone_manager', 'evidence:export', 'zone', false, 'Export evidence'),
  ('zone_manager', 'device:configure', 'zone', false, 'Configure devices'),
  ('zone_manager', 'user:manage', 'zone', false, 'Manage zone users'),
  
  -- Region Manager
  ('region_manager', 'live:view', 'region', false, 'View live camera feeds at region level'),
  ('region_manager', 'recording:view', 'region', false, 'View recorded footage'),
  ('region_manager', 'evidence:export', 'region', false, 'Export evidence'),
  ('region_manager', 'device:configure', 'region', false, 'Configure devices'),
  
  -- Area Manager
  ('area_manager', 'live:view', 'area', false, 'View live camera feeds at area level'),
  ('area_manager', 'recording:view', 'area', false, 'View recorded footage'),
  ('area_manager', 'evidence:export', 'area', false, 'Export evidence'),
  
  -- Branch Manager
  ('branch_manager', 'live:view', 'branch', false, 'View live camera feeds at branch'),
  ('branch_manager', 'recording:view', 'branch', false, 'View recorded footage'),
  ('branch_manager', 'evidence:export', 'branch', false, 'Export evidence'),
  ('branch_manager', 'ptz:operate', 'branch', false, 'Operate PTZ cameras'),
  ('branch_manager', 'alarm:acknowledge', 'branch', false, 'Acknowledge alarms'),
  
  -- Operator
  ('operator', 'live:view', 'branch', false, 'View live camera feeds'),
  ('operator', 'recording:view', 'branch', false, 'View recorded footage'),
  ('operator', 'ptz:operate', 'branch', false, 'Operate PTZ cameras'),
  ('operator', 'alarm:acknowledge', 'branch', false, 'Acknowledge alarms'),
  
  -- Viewer
  ('viewer', 'live:view', NULL, false, 'View live camera feeds'),
  
  -- Security Officer
  ('security_officer', 'live:view', 'branch', false, 'View live camera feeds'),
  ('security_officer', 'recording:view', 'branch', false, 'View recorded footage'),
  ('security_officer', 'evidence:export', 'branch', false, 'Export evidence'),
  ('security_officer', 'alarm:acknowledge', 'branch', false, 'Acknowledge alarms'),
  
  -- Auditor
  ('auditor', 'audit:view', NULL, false, 'View audit logs'),
  ('auditor', 'recording:view', NULL, false, 'View recorded footage for audit')
ON CONFLICT (role, action, resource_type) DO NOTHING;

-- Function to automatically grant role-based permissions when user is created/updated
CREATE OR REPLACE FUNCTION grant_role_based_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete existing role-based grants to avoid duplicates
  DELETE FROM access_grants
  WHERE user_id = NEW.id
    AND grant_source = 'role';

  -- Rebuild role grants for every organizational assignment.
  INSERT INTO access_grants (
    tenant_id, user_id, scope_node_id, action, effect, grant_source
  )
  SELECT
    NEW.tenant_id, NEW.id, assignment.scope_node_id,
    permission.action, 'allow', 'role'
  FROM user_organizational_assignments assignment
  CROSS JOIN role_permissions permission
  WHERE assignment.user_id = NEW.id
    AND permission.role = NEW.role;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-grant permissions on user role change
CREATE TRIGGER auto_grant_role_permissions
  AFTER INSERT OR UPDATE OF role ON users
  FOR EACH ROW
  WHEN (NEW.role IS NOT NULL)
  EXECUTE FUNCTION grant_role_based_permissions();

-- Rebuild permissions for identities that existed before this trigger.
UPDATE users
SET role = role
WHERE identity_subject = 'user-global-admin';

-- Function to check account lockout
CREATE OR REPLACE FUNCTION check_account_lockout(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_locked_until timestamptz;
  v_status user_status;
BEGIN
  SELECT locked_until, status
  INTO v_locked_until, v_status
  FROM users
  WHERE id = p_user_id;

  -- Check if account is permanently locked
  IF v_status = 'locked' THEN
    RETURN true;
  END IF;

  -- Check if account is temporarily locked
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN true;
  END IF;

  -- Clear temporary lock if expired
  IF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    UPDATE users
    SET locked_until = NULL, login_attempts = 0
    WHERE id = p_user_id;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to record failed login attempt
CREATE OR REPLACE FUNCTION record_failed_login(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_attempts integer;
  max_attempts constant integer := 5;
  lockout_duration constant interval := '30 minutes';
BEGIN
  UPDATE users
  SET 
    login_attempts = login_attempts + 1,
    locked_until = CASE 
      WHEN login_attempts + 1 >= max_attempts 
      THEN now() + lockout_duration
      ELSE locked_until
    END
  WHERE id = p_user_id
  RETURNING login_attempts INTO v_attempts;

  -- Log the failed attempt
  INSERT INTO audit_events (
    tenant_id,
    actor_user_id,
    action,
    outcome,
    details
  )
  SELECT 
    tenant_id,
    id,
    'user.login_failed',
    'failure',
    jsonb_build_object(
      'attempts', v_attempts,
      'locked', v_attempts >= max_attempts
    )
  FROM users
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record successful login
CREATE OR REPLACE FUNCTION record_successful_login(p_user_id uuid, p_ip_address inet DEFAULT NULL)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET 
    login_attempts = 0,
    locked_until = NULL,
    last_login_at = now()
  WHERE id = p_user_id;

  -- Log the successful login
  INSERT INTO audit_events (
    tenant_id,
    actor_user_id,
    action,
    outcome,
    source_ip,
    details
  )
  SELECT 
    tenant_id,
    id,
    'user.login_success',
    'success',
    p_ip_address,
    jsonb_build_object('timestamp', now())
  FROM users
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- View for user details with organizational context
CREATE VIEW user_details_view AS
SELECT 
  u.id,
  u.tenant_id,
  u.email,
  u.username,
  u.employee_id,
  u.display_name,
  u.phone_number,
  u.role,
  u.status,
  u.department,
  u.designation,
  u.date_of_joining,
  u.reporting_to_user_id,
  reporting_user.display_name as reporting_to_name,
  u.last_login_at,
  u.active,
  u.created_at,
  -- Primary organizational assignment
  uoa.scope_node_id as primary_org_node_id,
  rn.node_type as primary_org_type,
  rn.name as primary_org_name,
  rn.code as primary_org_code,
  rn.path as primary_org_path,
  -- Count of accessible branches
  (SELECT COUNT(DISTINCT cn.id)
   FROM resource_nodes cn
   WHERE cn.path <@ rn.path
   AND cn.node_type = 'branch'
   AND cn.is_active = true) as accessible_branches_count,
  -- Count of accessible cameras
  (SELECT COUNT(DISTINCT c.id)
   FROM cameras c
   JOIN resource_nodes cam_node ON c.resource_node_id = cam_node.id
   WHERE cam_node.path <@ rn.path) as accessible_cameras_count
FROM users u
LEFT JOIN users reporting_user ON u.reporting_to_user_id = reporting_user.id
LEFT JOIN user_organizational_assignments uoa 
  ON u.id = uoa.user_id AND uoa.is_primary = true
LEFT JOIN resource_nodes rn ON uoa.scope_node_id = rn.id;

-- Update trigger for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE user_sessions IS 'Active user authentication sessions with JWT tokens';
COMMENT ON TABLE password_reset_tokens IS 'One-time tokens for password reset functionality';
COMMENT ON TABLE user_organizational_assignments IS 'Maps users to organizational nodes they can access';
COMMENT ON TABLE role_permissions IS 'Template of permissions granted to each role';

COMMENT ON COLUMN users.role IS 'User role determining base permissions';
COMMENT ON COLUMN users.status IS 'Account status (active, inactive, suspended, locked, pending_activation)';
COMMENT ON COLUMN users.login_attempts IS 'Failed login attempt counter for account lockout';
COMMENT ON COLUMN users.locked_until IS 'Timestamp until which account is temporarily locked';
COMMENT ON COLUMN users.must_change_password IS 'Forces password change on next login';

COMMENT ON FUNCTION check_account_lockout IS 'Checks if user account is locked due to failed login attempts';
COMMENT ON FUNCTION record_failed_login IS 'Records failed login attempt and locks account after threshold';
COMMENT ON FUNCTION record_successful_login IS 'Resets login attempts and updates last login timestamp';
