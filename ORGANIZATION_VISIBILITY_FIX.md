# Organization Visibility Issue - Fix Guide

## Problem
You're seeing the error: **"An organization already exists. Only one organization is allowed per system."**

However, no organization is showing in the UI. This means:
1. ✅ An organization **does exist** in the database
2. ❌ Your user account **cannot see it** due to missing permissions

## Root Cause
The `/v1/organization/tree` API endpoint filters organization nodes based on user permissions. If you don't have:
- The `company_admin` or `super_admin` role, OR
- An explicit assignment to the organization node via `role_node_assignments`

...then the organization will be filtered out and appear as if it doesn't exist.

## Solutions

### Option 1: Grant Company Admin Role (Recommended)

This is the simplest fix for initial setup. It gives full access to all organization nodes.

**Steps:**
1. Connect to your database
2. Run the fix script:
   ```bash
   psql -d your_database_name -f fix-organization-visibility.sql
   ```

Or manually run this SQL:
```sql
-- Replace 'your_username' with your actual username
UPDATE users
SET role = 'company_admin'
WHERE username = 'your_username'
  AND is_active = true;
```

**What this does:**
- Upgrades your user role to `company_admin`
- `company_admin` users can see ALL organization nodes in their tenant
- You'll immediately see the organization in the UI

### Option 2: Assign User to Organization Node

If you want to keep specific role-based access (not give full admin access):

```sql
-- Get your user ID and company node ID first
SELECT u.id as user_id, u.display_name,
       n.id as company_id, n.name as company_name
FROM users u
CROSS JOIN resource_nodes n
WHERE u.username = 'your_username'
  AND n.node_type = 'company'
  AND u.is_active = true
  AND n.is_active = true;

-- Then insert the assignment (replace IDs with actual values from above)
INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
VALUES (
    'your-user-id-here',
    'company-node-id-here',
    'node_admin',
    'your-user-id-here'
)
ON CONFLICT (user_id, node_id) DO UPDATE
SET role = 'node_admin';
```

### Option 3: Delete Existing Organization (Nuclear Option)

If the existing organization is corrupted or you want to start fresh:

```sql
-- WARNING: This will deactivate the existing organization
-- You'll be able to create a new one afterward

UPDATE resource_nodes
SET is_active = false
WHERE node_type = 'company'
  AND is_active = true;
```

After this, refresh your browser and you should see the "Create Organization" form again.

## Verification

After applying a fix, verify it worked:

```sql
-- Check your role
SELECT username, display_name, role
FROM users
WHERE is_active = true;

-- Check your node assignments
SELECT 
    u.display_name,
    n.name as node_name,
    n.node_type,
    rn.role
FROM role_node_assignments rn
JOIN users u ON u.id = rn.user_id
JOIN resource_nodes n ON n.id = rn.node_id
WHERE u.is_active = true;

-- Check if organization is visible via API
SELECT id, name, node_type, tenant_id, is_active
FROM resource_nodes
WHERE node_type = 'company';
```

## Understanding the Permission System

The system has two permission models:

1. **Role-Based Access** (higher level):
   - `super_admin`: Full system access
   - `company_admin`: Full access to their tenant's organization
   - `branch_admin`: Access to their branch and below
   - `operator`: Limited access

2. **Node-Based Access** (granular):
   - Explicit assignments in `role_node_assignments` table
   - Users are assigned to specific organization nodes
   - Roles: `node_admin`, `node_operator`, `viewer`

The API endpoint checks BOTH systems and returns only nodes the user can access.

## Prevention

To avoid this issue in the future:

1. **Always assign users when creating them** - Use the user creation UI which handles assignments automatically
2. **Use company_admin role for initial setup** - Grant this role to at least one user
3. **Document organization structure** - Keep track of who should have access to what

## Technical Details

The filtering happens in `src/routes/organization.routes.ts`:

```typescript
app.get("/v1/organization/tree", async (request) => {
  const tenantId = request.currentUser.tenantId;
  const nodes = await store.getOrganizationTree(tenantId);
  const visible = await visibleOrganizationNodeIds(request, store);
  return { data: filterOrganizationTree(nodes, visible) };  // ← Filters here
});
```

The `visibleOrganizationNodeIds` function checks:
1. Nodes accessible via `live:view` action
2. Nodes accessible via `audit:view` action  
3. Nodes accessible via `org:manage` action

If none of these permissions grant access to the organization node, it won't appear in the tree.

## Need More Help?

Run the diagnostic script to see exactly what's in your database:

```bash
psql -d your_database_name -f diagnose-org-issue.sql
```

This will show:
- All organizations in the database
- All active users and their roles
- All role-node assignments
- A diagnosis of the issue
