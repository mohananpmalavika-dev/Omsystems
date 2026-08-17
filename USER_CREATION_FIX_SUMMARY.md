# User Creation Foreign Key Constraint Fix

## Problem

When creating a new user through the dashboard UI (Admin → Users → Create New User), the system was throwing a database foreign key constraint error:

```
insert or update on table "user_organizational_assignments" violates foreign key constraint "user_organizational_assignments_assigned_by_user_id_fkey"
```

## Root Cause

The error occurred in the `assignOrganization` method within `src/database/infrastructure-repository.ts`. When a user was created, the system tried to record who assigned the user to their primary organization using the `assigned_by_user_id` field.

### The Flow:

1. **User Creation API** (`src/routes/user.routes.ts`, line 193):
   ```typescript
   const user = await store.createUser(request.currentUser.tenantId, {
     ...body,
     passwordHash,
     createdBy: request.currentUser.id,  // ← Passes current user's ID
   });
   ```

2. **Create User Method** (`src/database/infrastructure-repository.ts`, line 792):
   ```typescript
   await this.assignOrganization(client, id, input.primaryOrgNodeId, true, input.createdBy ?? null);
   ```

3. **Original Assign Organization** (BEFORE FIX):
   ```typescript
   let resolvedAssignedBy = assignedBy;
   if (assignedBy && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedBy)) {
     const u = await this.getUserById(assignedBy);
     resolvedAssignedBy = u?.id ?? null;
   }
   ```

   **Problem:** If `assignedBy` was already a UUID but that user didn't exist in the database, the code would attempt to insert that invalid UUID into the `assigned_by_user_id` column, violating the foreign key constraint.

## The Fix

Updated the `assignOrganization` method to validate that the `assigned_by_user_id` references an existing user before attempting the database insertion:

```typescript
// Validate that assignedBy refers to an existing user
let resolvedAssignedBy: string | null = null;
if (assignedBy) {
  let userToCheck = assignedBy;
  // If not a UUID, try to resolve it
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedBy)) {
    const u = await this.getUserById(assignedBy);
    userToCheck = u?.id ?? '';
  }
  // Verify the user exists in the database
  if (userToCheck) {
    const existingUser = await client.query(
      'SELECT id FROM users WHERE id = $1::uuid',
      [userToCheck]
    );
    if (existingUser.rows.length > 0) {
      resolvedAssignedBy = userToCheck;
    }
  }
}
```

### What Changed:

1. **Explicit Validation**: Now performs a database query to verify the user exists before using their ID
2. **Safe Fallback**: Sets `assigned_by_user_id` to `NULL` if the user doesn't exist (the column allows NULL values)
3. **Handles Both Formats**: Works whether `assignedBy` is a UUID or a username/identity

## Benefits

✅ **Prevents Foreign Key Violations**: Invalid user IDs are caught before database insertion  
✅ **Graceful Degradation**: User creation succeeds even if the "assigned by" user is invalid  
✅ **Maintains Audit Trail**: When valid, still records who assigned the user  
✅ **Backward Compatible**: Existing code continues to work as expected  

## Testing

### Manual Test in Dashboard:

1. Navigate to **Admin** → **Users** → **Create New User**
2. Fill in the form:
   - Username: `dhanya`
   - Email: `mgdhanyamohan@gmail.com`
   - Password: (your password)
   - Display Name: `Dhanya`
   - Role: `Super Admin`
   - Primary Organization: `AdithVision (company)`
3. Click **Create User**

**Expected Result**: User is created successfully without any foreign key constraint errors.

### Database Verification:

```sql
-- Check the user was created
SELECT id, username, email, role, status 
FROM users 
WHERE username = 'dhanya';

-- Check their organizational assignment
SELECT 
  uoa.id,
  uoa.user_id,
  uoa.scope_node_id,
  uoa.is_primary,
  uoa.assigned_by_user_id,
  rn.name as org_name
FROM user_organizational_assignments uoa
JOIN resource_nodes rn ON rn.id = uoa.scope_node_id
WHERE uoa.user_id IN (SELECT id FROM users WHERE username = 'dhanya');
```

## Files Changed

- ✅ **`src/database/infrastructure-repository.ts`**: Fixed `assignOrganization` method
- ✅ **`FIX_AUTHENTICATION.md`**: Updated with fix documentation
- ✅ **`USER_CREATION_FIX_SUMMARY.md`**: This document

## Related Issues

This fix resolves the immediate user creation issue. For authentication and login setup, see `FIX_AUTHENTICATION.md`.

## Database Schema Context

The `user_organizational_assignments` table structure:

```sql
CREATE TABLE user_organizational_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id uuid REFERENCES users(id),  -- ← This can be NULL
  
  UNIQUE (user_id, scope_node_id)
);
```

Note: `assigned_by_user_id` does **not** have `NOT NULL`, so it's safe to set it to `NULL` when the assigning user is unknown or invalid.

## Deployment

After this fix:

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy to your environment (Render, local, etc.)

3. Test user creation in the dashboard

## Prevention

To prevent similar issues in the future:

1. **Validate Foreign Keys**: Always verify that referenced IDs exist before insertion
2. **Use NULL for Optional References**: When a foreign key is optional (no NOT NULL constraint), use NULL instead of invalid values
3. **Add Database Checks**: Consider adding database-level checks or triggers for critical foreign keys
4. **API Validation**: Validate input IDs at the API layer before passing to database methods

---

**Status**: ✅ Fixed and ready for testing
**Date**: August 17, 2026
**Author**: System
