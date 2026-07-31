-- Script to make user 'mgdhanyamohan' a super_admin
-- Run this directly in your PostgreSQL database

-- Update the user role to super_admin
UPDATE users
SET 
  role = 'super_admin',
  status = 'active',
  updated_at = now()
WHERE username = 'mgdhanyamohan';

-- Verify the update
SELECT 
  id,
  username,
  display_name,
  email,
  role,
  status,
  active,
  tenant_id,
  created_at,
  updated_at
FROM users
WHERE username = 'mgdhanyamohan';

-- Optional: Grant all organization access to this user
-- This creates access grants for org:manage action on all nodes
INSERT INTO access_grants (tenant_id, user_id, scope_node_id, action, effect, created_at)
SELECT 
  u.tenant_id,
  u.id as user_id,
  rn.id as scope_node_id,
  'org:manage' as action,
  'allow' as effect,
  now() as created_at
FROM users u
CROSS JOIN resource_nodes rn
WHERE u.username = 'mgdhanyamohan'
  AND rn.tenant_id = u.tenant_id
  AND rn.node_type = 'company'
  AND NOT EXISTS (
    SELECT 1 FROM access_grants ag
    WHERE ag.user_id = u.id 
      AND ag.scope_node_id = rn.id 
      AND ag.action = 'org:manage'
  );

-- Confirm the grants
SELECT 
  u.username,
  u.role,
  ag.action,
  rn.name as node_name,
  rn.node_type,
  ag.effect
FROM users u
LEFT JOIN access_grants ag ON ag.user_id = u.id
LEFT JOIN resource_nodes rn ON rn.id = ag.scope_node_id
WHERE u.username = 'mgdhanyamohan'
ORDER BY ag.action;

COMMIT;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'User mgdhanyamohan has been updated to super_admin role';
  RAISE NOTICE 'Please log out and log back in for changes to take effect';
END $$;
