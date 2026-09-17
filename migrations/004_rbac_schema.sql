-- ============================================================================
-- Migration 004: Role-Based Access Control (RBAC) Schema
-- ============================================================================
-- Purpose: Implement comprehensive RBAC for MIS reports and system features
-- Date: September 17, 2026
-- Dependencies: Users table must exist
-- Impact: Adds role management, permission control, and audit trail
-- ============================================================================

-- ============================================================================
-- STEP 1: Create User Roles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system_role BOOLEAN DEFAULT false, -- Cannot be deleted
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  CONSTRAINT valid_role_name CHECK (name ~ '^[a-z_]+$')
);

-- Index for role lookups
CREATE INDEX idx_user_roles_name ON user_roles(name) WHERE active = true;
CREATE INDEX idx_user_roles_active ON user_roles(active, name);

-- ============================================================================
-- STEP 2: Insert Predefined System Roles
-- ============================================================================

INSERT INTO user_roles (name, display_name, description, permissions, is_system_role) VALUES
  -- Super Admin: Full system access
  (
    'super_admin',
    'Super Administrator',
    'Full unrestricted access to all system features and reports',
    '["*"]'::jsonb,
    true
  ),
  
  -- Executive Roles
  (
    'ceo',
    'CEO / Board Member',
    'Executive-level access to strategic KPIs, financial reports, and compliance',
    '[
      "reports:executive-kpi",
      "reports:executive-kpi:*",
      "reports:financial",
      "reports:financial:*",
      "reports:branch-benchmarking",
      "reports:compliance",
      "reports:mis",
      "reports:ai-analytics:view",
      "dashboard:executive",
      "alerts:view",
      "insights:view"
    ]'::jsonb,
    true
  ),
  
  (
    'cfo',
    'CFO / Finance Team',
    'Financial reports, TCO analysis, ROI tracking, budget management',
    '[
      "reports:financial",
      "reports:financial:*",
      "reports:executive-kpi:view",
      "reports:branch-benchmarking",
      "reports:mis:financial",
      "dashboard:financial",
      "forecasting:cost",
      "alerts:financial"
    ]'::jsonb,
    true
  ),
  
  (
    'coo',
    'COO / Operations Head',
    'Operations reports, branch performance, compliance, MIS unified',
    '[
      "reports:executive-kpi",
      "reports:branch-benchmarking",
      "reports:branch-benchmarking:*",
      "reports:compliance",
      "reports:mis",
      "reports:mis:*",
      "reports:ai-analytics:view",
      "dashboard:operations",
      "alerts:operational",
      "forecasting:incidents"
    ]'::jsonb,
    true
  ),
  
  -- Department Heads
  (
    'compliance_officer',
    'Compliance Officer',
    'Compliance scorecard, audit reports, regulatory tracking',
    '[
      "reports:compliance",
      "reports:compliance:*",
      "reports:executive-kpi:view",
      "reports:branch-benchmarking:compliance",
      "dashboard:compliance",
      "alerts:compliance",
      "audit:view"
    ]'::jsonb,
    true
  ),
  
  (
    'security_manager',
    'Security Manager',
    'Security operations, incident reports, AI analytics, SOC performance',
    '[
      "reports:executive-kpi:security",
      "reports:branch-benchmarking:security",
      "reports:ai-analytics",
      "reports:ai-analytics:*",
      "reports:mis:security",
      "dashboard:security",
      "incidents:*",
      "alerts:security",
      "cameras:*"
    ]'::jsonb,
    true
  ),
  
  -- Branch Management
  (
    'branch_manager',
    'Branch Manager',
    'Own branch reports only, limited compliance and benchmarking access',
    '[
      "reports:branch-benchmarking:own",
      "reports:compliance:own",
      "reports:mis:own",
      "dashboard:branch:own",
      "incidents:own",
      "alerts:own",
      "cameras:own"
    ]'::jsonb,
    true
  ),
  
  -- Analysts
  (
    'finance_analyst',
    'Finance Analyst',
    'Read-only financial reports, cost analysis',
    '[
      "reports:financial:view",
      "reports:executive-kpi:financial:view",
      "reports:branch-benchmarking:view",
      "dashboard:financial:view"
    ]'::jsonb,
    true
  ),
  
  (
    'operations_analyst',
    'Operations Analyst',
    'Read-only operational reports, branch performance',
    '[
      "reports:executive-kpi:operations:view",
      "reports:branch-benchmarking:view",
      "reports:mis:view",
      "dashboard:operations:view",
      "incidents:view"
    ]'::jsonb,
    true
  ),
  
  -- Basic Access
  (
    'viewer',
    'Read-Only Viewer',
    'View-only access to non-sensitive reports',
    '[
      "reports:executive-kpi:view",
      "reports:branch-benchmarking:view",
      "dashboard:view"
    ]'::jsonb,
    true
  );

-- ============================================================================
-- STEP 3: Add Role Fields to Users Table
-- ============================================================================

-- Add role_id column (foreign key to user_roles)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES user_roles(id);

-- Add role_name column (denormalized for faster lookups)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_name VARCHAR(50);

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id, active);
CREATE INDEX IF NOT EXISTS idx_users_role_name ON users(role_name) WHERE active = true;

-- ============================================================================
-- STEP 4: Create Role Permissions Expansion Table
-- ============================================================================
-- This table stores granular permissions for easier querying

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  resource VARCHAR(100) NOT NULL, -- 'reports', 'dashboard', 'incidents', etc.
  action VARCHAR(50) NOT NULL, -- 'view', 'create', 'edit', 'delete', 'export', etc.
  scope VARCHAR(50) DEFAULT 'all', -- 'all', 'own', 'branch', 'region', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role_id, resource, action, scope)
);

-- Index for permission checks
CREATE INDEX idx_role_permissions_lookup ON role_permissions(role_id, resource, action);

-- ============================================================================
-- STEP 5: Populate Role Permissions Table from JSONB
-- ============================================================================

CREATE OR REPLACE FUNCTION expand_role_permissions() RETURNS void AS $$
DECLARE
  role_record RECORD;
  permission TEXT;
  parts TEXT[];
  resource VARCHAR(100);
  action VARCHAR(50);
  scope VARCHAR(50);
BEGIN
  -- Clear existing permissions
  TRUNCATE role_permissions;
  
  -- Expand permissions for each role
  FOR role_record IN SELECT id, name, permissions FROM user_roles WHERE active = true LOOP
    -- Handle wildcard permission
    IF role_record.permissions @> '["*"]'::jsonb THEN
      INSERT INTO role_permissions (role_id, resource, action, scope)
      VALUES (role_record.id, '*', '*', 'all');
      CONTINUE;
    END IF;
    
    -- Parse each permission
    FOR permission IN SELECT jsonb_array_elements_text(role_record.permissions) LOOP
      parts := string_to_array(permission, ':');
      
      -- Parse permission format: resource:action:scope
      resource := parts[1];
      action := COALESCE(parts[2], '*');
      scope := COALESCE(parts[3], 'all');
      
      INSERT INTO role_permissions (role_id, resource, action, scope)
      VALUES (role_record.id, resource, action, scope)
      ON CONFLICT (role_id, resource, action, scope) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute initial expansion
SELECT expand_role_permissions();

-- ============================================================================
-- STEP 6: Create Permission Check Functions
-- ============================================================================

-- Check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_resource VARCHAR,
  p_action VARCHAR,
  p_scope VARCHAR DEFAULT 'all'
) RETURNS BOOLEAN AS $$
DECLARE
  user_role_id UUID;
BEGIN
  -- Get user's role
  SELECT role_id INTO user_role_id FROM users WHERE id = p_user_id AND active = true;
  
  IF user_role_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for wildcard permission
  IF EXISTS (
    SELECT 1 FROM role_permissions 
    WHERE role_id = user_role_id 
      AND resource = '*' 
      AND action = '*'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check for exact permission
  IF EXISTS (
    SELECT 1 FROM role_permissions 
    WHERE role_id = user_role_id 
      AND resource = p_resource 
      AND (action = p_action OR action = '*')
      AND (scope = p_scope OR scope = 'all')
  ) THEN
    RETURN true;
  END IF;
  
  -- Check for resource-level wildcard (e.g., "reports:*")
  IF EXISTS (
    SELECT 1 FROM role_permissions 
    WHERE role_id = user_role_id 
      AND resource = p_resource 
      AND action = '*'
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Get all permissions for a user
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(resource VARCHAR, action VARCHAR, scope VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT rp.resource, rp.action, rp.scope
  FROM role_permissions rp
  JOIN users u ON u.role_id = rp.role_id
  WHERE u.id = p_user_id AND u.active = true;
END;
$$ LANGUAGE plpgsql;

-- Get all reports accessible to user
CREATE OR REPLACE FUNCTION get_user_reports(p_user_id UUID)
RETURNS TABLE(report_type VARCHAR, access_level VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN rp.resource = '*' THEN 'all'
      ELSE REPLACE(rp.resource, 'reports:', '')
    END as report_type,
    CASE
      WHEN rp.action = '*' THEN 'full'
      WHEN rp.action = 'view' THEN 'read-only'
      ELSE rp.action
    END as access_level
  FROM role_permissions rp
  JOIN users u ON u.role_id = rp.role_id
  WHERE u.id = p_user_id 
    AND u.active = true
    AND (rp.resource LIKE 'reports:%' OR rp.resource = '*');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Create Role Change Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  old_role_id UUID REFERENCES user_roles(id),
  old_role_name VARCHAR(50),
  new_role_id UUID REFERENCES user_roles(id),
  new_role_name VARCHAR(50),
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX idx_role_changes_user ON role_change_log(user_id, changed_at DESC);
CREATE INDEX idx_role_changes_date ON role_change_log(changed_at DESC);

-- ============================================================================
-- STEP 8: Create Trigger to Log Role Changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_role_change() RETURNS TRIGGER AS $$
BEGIN
  -- Only log if role actually changed
  IF OLD.role_id IS DISTINCT FROM NEW.role_id THEN
    INSERT INTO role_change_log (
      user_id, 
      old_role_id, 
      old_role_name, 
      new_role_id, 
      new_role_name,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.role_id,
      OLD.role_name,
      NEW.role_id,
      NEW.role_name,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_role_change
  AFTER UPDATE OF role_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_role_change();

-- ============================================================================
-- STEP 9: Create Trigger to Update role_name (Denormalization)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_role_name() RETURNS TRIGGER AS $$
BEGIN
  -- Update role_name when role_id changes
  IF NEW.role_id IS NOT NULL THEN
    SELECT name INTO NEW.role_name FROM user_roles WHERE id = NEW.role_id;
  ELSE
    NEW.role_name := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_role_name
  BEFORE INSERT OR UPDATE OF role_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_role_name();

-- ============================================================================
-- STEP 10: Create Helper Views
-- ============================================================================

-- View: Users with their roles and permissions
CREATE OR REPLACE VIEW v_users_with_roles AS
SELECT 
  u.id as user_id,
  u.email,
  u.name,
  u.active as user_active,
  ur.id as role_id,
  ur.name as role_name,
  ur.display_name as role_display_name,
  ur.permissions,
  ur.active as role_active
FROM users u
LEFT JOIN user_roles ur ON ur.id = u.role_id;

-- View: Permission matrix (all roles and their permissions)
CREATE OR REPLACE VIEW v_permission_matrix AS
SELECT 
  ur.name as role_name,
  ur.display_name as role_display_name,
  rp.resource,
  rp.action,
  rp.scope
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.id
WHERE ur.active = true
ORDER BY ur.name, rp.resource, rp.action;

-- ============================================================================
-- STEP 11: Create Data Validation Functions
-- ============================================================================

-- Validate role assignment
CREATE OR REPLACE FUNCTION validate_role_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure role exists and is active
  IF NEW.role_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE id = NEW.role_id AND active = true) THEN
      RAISE EXCEPTION 'Cannot assign inactive or non-existent role';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_role_assignment
  BEFORE INSERT OR UPDATE OF role_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION validate_role_assignment();

-- ============================================================================
-- STEP 12: Create Migration Verification Queries
-- ============================================================================

-- Verify roles created
DO $$
DECLARE
  role_count INT;
BEGIN
  SELECT COUNT(*) INTO role_count FROM user_roles WHERE is_system_role = true;
  
  IF role_count < 10 THEN
    RAISE WARNING 'Expected 10 system roles, found %', role_count;
  ELSE
    RAISE NOTICE '✓ Successfully created % system roles', role_count;
  END IF;
END $$;

-- Verify permissions expanded
DO $$
DECLARE
  perm_count INT;
BEGIN
  SELECT COUNT(*) INTO perm_count FROM role_permissions;
  
  IF perm_count < 50 THEN
    RAISE WARNING 'Expected 50+ permissions, found %', perm_count;
  ELSE
    RAISE NOTICE '✓ Successfully expanded % permissions', perm_count;
  END IF;
END $$;

-- Verify functions created
DO $$
BEGIN
  -- Test permission check function
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'user_has_permission') THEN
    RAISE EXCEPTION 'Function user_has_permission not created';
  END IF;
  
  RAISE NOTICE '✓ All functions created successfully';
END $$;

-- ============================================================================
-- STEP 13: Create Sample Data (Optional - for testing)
-- ============================================================================

-- Assign super_admin role to first user (for testing)
-- Uncomment to auto-assign during development
-- UPDATE users 
-- SET role_id = (SELECT id FROM user_roles WHERE name = 'super_admin')
-- WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1);

-- ============================================================================
-- STEP 14: Grant Permissions
-- ============================================================================

-- Grant SELECT on views to application role
-- GRANT SELECT ON v_users_with_roles TO app_role;
-- GRANT SELECT ON v_permission_matrix TO app_role;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
-- 
-- DROP TRIGGER IF EXISTS trigger_log_role_change ON users;
-- DROP TRIGGER IF EXISTS trigger_update_role_name ON users;
-- DROP TRIGGER IF EXISTS trigger_validate_role_assignment ON users;
-- DROP FUNCTION IF EXISTS log_role_change();
-- DROP FUNCTION IF EXISTS update_user_role_name();
-- DROP FUNCTION IF EXISTS validate_role_assignment();
-- DROP FUNCTION IF EXISTS user_has_permission(UUID, VARCHAR, VARCHAR, VARCHAR);
-- DROP FUNCTION IF EXISTS get_user_permissions(UUID);
-- DROP FUNCTION IF EXISTS get_user_reports(UUID);
-- DROP FUNCTION IF EXISTS expand_role_permissions();
-- DROP VIEW IF EXISTS v_users_with_roles;
-- DROP VIEW IF EXISTS v_permission_matrix;
-- DROP TABLE IF EXISTS role_change_log;
-- DROP TABLE IF EXISTS role_permissions;
-- ALTER TABLE users DROP COLUMN IF EXISTS role_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS role_name;
-- DROP TABLE IF EXISTS user_roles;

-- ============================================================================
-- END OF MIGRATION 004
-- ============================================================================

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 004: RBAC Schema - COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - user_roles table (10 system roles)';
  RAISE NOTICE '  - role_permissions table';
  RAISE NOTICE '  - role_change_log table';
  RAISE NOTICE '  - Permission check functions';
  RAISE NOTICE '  - Audit triggers';
  RAISE NOTICE '  - Helper views';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Assign roles to existing users';
  RAISE NOTICE '  2. Update API routes with requirePermission()';
  RAISE NOTICE '  3. Update frontend with role-based rendering';
  RAISE NOTICE '========================================';
END $$;
