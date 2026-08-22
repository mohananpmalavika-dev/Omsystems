-- Diagnostic queries to understand the organization visibility issue

-- 1. Check if organizations exist
SELECT 
    'Organizations in database:' as check_type,
    id,
    name,
    node_type,
    tenant_id,
    is_active,
    parent_id
FROM resource_nodes
WHERE node_type = 'company'
ORDER BY created_at;

-- 2. Check all users
SELECT 
    'Active users:' as check_type,
    id,
    username,
    display_name,
    role,
    tenant_id,
    is_active
FROM users
WHERE is_active = true
ORDER BY created_at;

-- 3. Check role-node assignments
SELECT 
    'Role-node assignments:' as check_type,
    rn.user_id,
    u.display_name,
    u.username,
    rn.node_id,
    n.name as node_name,
    n.node_type,
    rn.role
FROM role_node_assignments rn
LEFT JOIN users u ON u.id = rn.user_id
LEFT JOIN resource_nodes n ON n.id = rn.node_id
ORDER BY rn.assigned_at DESC;

-- 4. Check if there's a mismatch
SELECT 
    'Diagnosis:' as check_type,
    CASE 
        WHEN (SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'company' AND is_active = true) > 0
             AND (SELECT COUNT(*) FROM role_node_assignments) = 0
        THEN 'ISSUE: Organization exists but no user assignments found. Users cannot see the organization.'
        WHEN (SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'company' AND is_active = true) = 0
        THEN 'ERROR: No organization exists, but the API says one exists. Database issue?'
        ELSE 'Assignments exist, check tenant_id matching'
    END as diagnosis;
