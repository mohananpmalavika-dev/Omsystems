-- Fix script for organization visibility issue
-- This script will make the organization visible to users

-- OPTION 1: Make the first active user a company_admin (recommended for initial setup)
-- This gives them full access to all organization nodes
DO $$
DECLARE
    first_user_id uuid;
BEGIN
    -- Get the first active user
    SELECT id INTO first_user_id
    FROM users
    WHERE is_active = true
    ORDER BY created_at
    LIMIT 1;

    IF first_user_id IS NOT NULL THEN
        -- Update their role to company_admin
        UPDATE users
        SET role = 'company_admin'
        WHERE id = first_user_id;

        RAISE NOTICE 'Updated user % to company_admin role', first_user_id;
    ELSE
        RAISE NOTICE 'No active users found';
    END IF;
END $$;

-- OPTION 2: Assign all active users to the company node as node_admin
-- (Uncomment if you prefer explicit assignments instead of role-based access)
/*
DO $$
DECLARE
    company_node_id uuid;
    user_record record;
BEGIN
    -- Get the company node
    SELECT id INTO company_node_id
    FROM resource_nodes
    WHERE node_type = 'company'
      AND is_active = true
    ORDER BY created_at
    LIMIT 1;

    IF company_node_id IS NOT NULL THEN
        -- Assign all active users to this company node
        FOR user_record IN 
            SELECT id FROM users WHERE is_active = true
        LOOP
            INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
            VALUES (user_record.id, company_node_id, 'node_admin', user_record.id)
            ON CONFLICT (user_id, node_id) DO UPDATE
            SET role = 'node_admin';

            RAISE NOTICE 'Assigned user % to company node %', user_record.id, company_node_id;
        END LOOP;
    ELSE
        RAISE NOTICE 'No company node found';
    END IF;
END $$;
*/

-- Verify the fix
SELECT 
    u.display_name,
    u.username,
    u.role,
    COUNT(rn.node_id) as assigned_nodes
FROM users u
LEFT JOIN role_node_assignments rn ON rn.user_id = u.id
WHERE u.is_active = true
GROUP BY u.id, u.display_name, u.username, u.role;
