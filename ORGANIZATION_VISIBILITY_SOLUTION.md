# Organization Visibility Issue - Solution Summary

## Problem Identified

You encountered this error when trying to create an organization:
> **"An organization already exists. Only one organization is allowed per system."**

However, no organization was visible in the UI. This is a **permission visibility issue**, not a data integrity problem.

### Root Cause

The organization exists in the database but is filtered out by the API because your user account lacks the necessary permissions to view it. The `/v1/organization/tree` endpoint filters nodes based on:

1. User role (`super_admin`, `company_admin`, etc.)
2. Explicit node assignments in `role_node_assignments` table

If you have neither permission type, the organization appears invisible.

---

## Solutions Provided

### 1. **Diagnostic Endpoint** (`/v1/organization/debug`)
   - **Location:** `src/routes/organization.routes.ts`
   - **Purpose:** Shows exactly what organizations exist and why they're hidden
   - **Usage:** Visit `/api/v1/organization/debug` in your browser (while logged in)
   - **Returns:** User info, node counts, visibility status, and fix recommendations

### 2. **Database Diagnostic Script** (`diagnose-org-issue.sql`)
   - **Purpose:** Run SQL queries to see the database state
   - **Usage:** `psql -d your_database -f diagnose-org-issue.sql`
   - **Shows:**
     - All organizations in the system
     - All active users and their roles
     - All role-node assignments
     - Diagnosis of the mismatch

### 3. **Automated Fix Script** (`fix-organization-visibility.sql`)
   - **Purpose:** Automatically fix the permission issue
   - **Usage:** `psql -d your_database -f fix-organization-visibility.sql`
   - **Action:** Grants `company_admin` role to the first active user
   - **Alternative:** Contains commented-out code to assign users to organization nodes

### 4. **UI Diagnostic Component** (`dashboard/components/organization-visibility-fix.tsx`)
   - **Purpose:** Shows a friendly warning in the UI when this issue occurs
   - **Features:**
     - Detects hidden organizations automatically
     - Shows debug statistics (role, visible nodes, hidden nodes)
     - Provides SQL fix commands directly in the UI
     - Offers "Check Again" button to verify fix
   - **Integrated into:** Admin page when no organization is visible

### 5. **Complete Documentation** (`ORGANIZATION_VISIBILITY_FIX.md`)
   - **Purpose:** Step-by-step guide for users and administrators
   - **Contains:**
     - Problem explanation
     - Multiple solution options
     - Verification steps
     - Technical details about the permission system
     - Prevention tips

---

## Quick Fix (For Most Users)

### Option A: Using the Database Fix Script

```bash
# Run the automated fix
psql -d your_database_name -f fix-organization-visibility.sql
```

This will:
1. Find the first active user
2. Grant them `company_admin` role
3. Immediately make all organization nodes visible

### Option B: Manual SQL Fix

If you know your username:

```sql
-- Replace 'your_username' with your actual username
UPDATE users
SET role = 'company_admin'
WHERE username = 'your_username'
  AND is_active = true;
```

### Option C: Using the UI Diagnostic

1. Navigate to `/admin` in your application
2. You'll see the "Organization Permission Issue Detected" warning
3. Expand "Technical Details (for administrators)"
4. Copy the SQL command shown
5. Run it in your database
6. Click "Check Again"

---

## How to Verify the Fix Worked

### Method 1: Refresh the UI
- Refresh your browser after applying the SQL fix
- The organization should now appear in the admin panel

### Method 2: Check the Debug Endpoint
```bash
curl -X GET http://localhost:3000/api/v1/organization/debug \
  -H "Cookie: your-session-cookie"
```

### Method 3: Run Verification SQL
```sql
-- Check your role was updated
SELECT username, display_name, role
FROM users
WHERE username = 'your_username';

-- Should show role = 'company_admin'
```

---

## Understanding the Fix

### What Changed

**Before:**
- User role: `operator` (or similar)
- Visible nodes: 0
- Organization nodes: 1 (hidden)

**After:**
- User role: `company_admin`
- Visible nodes: All nodes in tenant
- Organization nodes: 1 (visible)

### Why It Works

The `company_admin` role has special privileges:
```typescript
// In src/routes/organization.routes.ts
if (
  request.currentUser.role === "super_admin" ||
  request.currentUser.role === "company_admin"
) {
  // Full access to organization statistics and nodes
}
```

This role bypasses the node-level permission checks and grants access to all organizational nodes within the tenant.

---

## Alternative Approaches

### If You Don't Want Full Admin Access

Instead of granting `company_admin` role, you can assign specific node access:

```sql
-- Get your user ID and organization ID
SELECT u.id as user_id, n.id as org_id
FROM users u
CROSS JOIN resource_nodes n
WHERE u.username = 'your_username'
  AND n.node_type = 'company';

-- Insert the assignment
INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
VALUES ('user-id-here', 'org-id-here', 'node_admin', 'user-id-here')
ON CONFLICT (user_id, node_id) DO UPDATE SET role = 'node_admin';
```

This gives you admin access to that specific organization node without full system admin privileges.

---

## Prevention

To avoid this issue in the future:

1. **Always use the user creation UI** - It handles permission assignments automatically
2. **Ensure at least one company_admin exists** - Set this during initial system setup
3. **Document your organization structure** - Keep track of who should access what
4. **Use the debug endpoint** - Check `/v1/organization/debug` if users report missing nodes

---

## Files Created/Modified

### New Files
- `ORGANIZATION_VISIBILITY_FIX.md` - Complete user/admin guide
- `ORGANIZATION_VISIBILITY_SOLUTION.md` - This file (solution summary)
- `diagnose-org-issue.sql` - Database diagnostic queries
- `fix-organization-visibility.sql` - Automated fix script
- `check-organization-permissions.ts` - Node.js diagnostic script
- `dashboard/components/organization-visibility-fix.tsx` - UI diagnostic component

### Modified Files
- `src/routes/organization.routes.ts` - Added `/v1/organization/debug` endpoint
- `dashboard/app/admin/page.tsx` - Integrated the visibility fix component

---

## Technical Details

### Permission Flow

```
User makes request → Authentication middleware adds user to request
                   → Organization endpoint called
                   → visibleOrganizationNodeIds() checks permissions
                        → Checks live:view permission
                        → Checks audit:view permission
                        → Checks org:manage permission
                   → filterOrganizationTree() removes invisible nodes
                   → Returns filtered tree to user
```

### Database Schema

**Tables involved:**
- `users` - Contains user roles (super_admin, company_admin, branch_admin, operator)
- `resource_nodes` - Contains organization hierarchy (company, branch, camera, etc.)
- `role_node_assignments` - Maps users to specific nodes with roles

### API Behavior

- `GET /v1/organization/tree` - Returns **filtered** tree (only visible nodes)
- `GET /v1/organization/debug` - Returns **unfiltered** info + visibility diagnostic
- `POST /v1/organization/nodes` - Checks permissions before creating nodes

---

## Need More Help?

If the fixes provided don't resolve your issue:

1. Check the `/v1/organization/debug` endpoint output
2. Verify your database connection and table structure
3. Check for any tenant_id mismatches
4. Review the complete `ORGANIZATION_VISIBILITY_FIX.md` guide
5. Check application logs for permission-related errors

---

## Summary

✅ **Issue:** Organization exists but invisible due to missing permissions  
✅ **Cause:** User lacks `company_admin` role or explicit node assignment  
✅ **Fix:** Grant `company_admin` role or assign user to organization node  
✅ **Tools:** SQL scripts, API endpoint, UI component, documentation provided  
✅ **Prevention:** Use proper user setup workflows and maintain at least one admin
