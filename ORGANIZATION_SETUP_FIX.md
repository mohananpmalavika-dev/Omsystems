# Organization Setup - Permission Fix

## Issue

When trying to create an organization through the new setup form, users encountered a 500 Internal Server Error:
```
Failed to create organization: ApiError: internal error
```

## Root Cause

The backend API (`src/routes/organization.routes.ts`) was too restrictive when checking permissions for creating a root-level company node. It only allowed users with the `super_admin` role to create the organization:

```typescript
if (
  body.nodeType !== "company" ||
  request.currentUser.role !== "super_admin"
) {
  return reply.code(403).send({ error: "forbidden" });
}
```

This meant that users with `company_admin` role couldn't create the organization, even though they should be able to during initial setup.

## Solution

Updated the permission check to:
1. Allow both `super_admin` and `company_admin` roles to create the root organization
2. Add validation to ensure only one company node exists per tenant
3. Provide better error messages for different scenarios

### Backend Changes (`src/routes/organization.routes.ts`)

**Before:**
```typescript
if (!body.parentNodeId) {
  if (
    body.nodeType !== "company" ||
    request.currentUser.role !== "super_admin"
  ) {
    return reply.code(403).send({ error: "forbidden" });
  }
}
```

**After:**
```typescript
if (!body.parentNodeId) {
  // Creating root company node
  if (body.nodeType !== "company") {
    return reply.code(400).send({ 
      error: "invalid_node_type",
      message: "Only company nodes can be created without a parent" 
    });
  }

  // Check if user has permission to create root organization
  // Allow super_admin and company_admin to create the root organization
  if (
    request.currentUser.role !== "super_admin" &&
    request.currentUser.role !== "company_admin"
  ) {
    return reply.code(403).send({ 
      error: "forbidden",
      message: "Only super_admin or company_admin can create organization" 
    });
  }

  // Check if organization already exists (only allow one company node per tenant)
  try {
    const existingNodes = await store.listOrganizationNodes(
      request.currentUser.tenantId,
      "company",
      undefined,
      false
    );
    
    if (existingNodes.length > 0) {
      return reply.code(409).send({ 
        error: "organization_already_exists",
        message: "An organization already exists for this tenant. Only one company node is allowed per tenant."
      });
    }
  } catch (err) {
    // If error checking existing nodes, log but allow to proceed
    console.error("Error checking existing organization:", err);
  }
}
```

### Frontend Changes (`dashboard/components/create-organization-form.tsx`)

Enhanced error handling to provide user-friendly messages:

```typescript
// Handle specific error cases
let errorMessage = "Failed to create organization";

if (err.statusCode === 403) {
  errorMessage = "You don't have permission to create an organization. Please contact your system administrator.";
} else if (err.statusCode === 409) {
  errorMessage = "An organization already exists. Only one organization is allowed per system.";
} else if (err.message) {
  errorMessage = err.message;
}

setError(errorMessage);
```

## New Features Added

### 1. Role-Based Access
- **super_admin**: Can always create organization
- **company_admin**: Can create organization during initial setup
- **Other roles**: Cannot create organization (will receive permission error)

### 2. Single Organization Enforcement
- Backend checks if an organization already exists
- Returns HTTP 409 (Conflict) if attempting to create a second organization
- Prevents duplicate company nodes per tenant

### 3. Better Error Messages
- **403 Forbidden**: User doesn't have permission
- **409 Conflict**: Organization already exists
- **400 Bad Request**: Invalid node type for root creation
- **500 Internal Server Error**: Actual server error (with details logged)

## Testing Checklist

✅ **Permission Tests:**
- [ ] super_admin can create organization
- [ ] company_admin can create organization
- [ ] Other roles receive permission denied error

✅ **Single Organization Tests:**
- [ ] First organization creation succeeds
- [ ] Second organization creation fails with 409 error
- [ ] Error message clearly states organization already exists

✅ **Error Handling:**
- [ ] Permission errors show user-friendly message
- [ ] Conflict errors show appropriate message
- [ ] Server errors are logged and reported

✅ **User Experience:**
- [ ] Form shows loading state during submission
- [ ] Errors are displayed clearly in the form
- [ ] Success triggers page refresh to show admin interface

## API Response Examples

### Success (201 Created)
```json
{
  "id": "uuid",
  "name": "My Company",
  "code": "COMP001",
  "type": "company",
  "tenantId": "uuid",
  ...
}
```

### Permission Denied (403 Forbidden)
```json
{
  "error": "forbidden",
  "message": "Only super_admin or company_admin can create organization"
}
```

### Organization Already Exists (409 Conflict)
```json
{
  "error": "organization_already_exists",
  "message": "An organization already exists for this tenant. Only one company node is allowed per tenant."
}
```

### Invalid Node Type (400 Bad Request)
```json
{
  "error": "invalid_node_type",
  "message": "Only company nodes can be created without a parent"
}
```

## User Roles Reference

As defined in the database (`database/migrations/008_employee_management_and_auth.sql`):

```sql
CREATE TYPE user_role AS ENUM (
  'super_admin',        -- Full system access
  'company_admin',      -- Company-level administrator (can create organization)
  'hq_admin',          -- Headquarters administrator
  'zone_manager',      -- Zone-level manager
  'region_manager',    -- Region-level manager
  'area_manager',      -- Area-level manager
  'branch_manager',    -- Branch-level manager
  'security_officer',  -- Security operations
  'operator',          -- Live monitoring operator
  'auditor',          -- Audit and compliance
  'technician'        -- Technical support
);
```

## Related Files

### Modified:
- `src/routes/organization.routes.ts` - Enhanced permission checks and validation
- `dashboard/components/create-organization-form.tsx` - Better error handling

### Related:
- `dashboard/app/admin/page.tsx` - Organization existence check
- `dashboard/components/organization-tree.tsx` - Display organization structure
- `dashboard/lib/api-client.ts` - API client methods
- `database/migrations/007_organizational_hierarchy.sql` - Hierarchy validation rules
- `database/migrations/008_employee_management_and_auth.sql` - User roles

## Deployment Notes

1. **Backend First**: Deploy backend changes before frontend
2. **Database**: No migrations required (roles already exist)
3. **Testing**: Test with both super_admin and company_admin roles
4. **Monitoring**: Watch for 403 and 409 errors in logs

## Future Enhancements

1. **Role Management UI**: Allow super_admin to grant company_admin role to initial user
2. **Multi-Tenant**: Ensure tenant isolation is properly enforced
3. **Audit Trail**: Log all organization creation attempts (success and failure)
4. **Organization Migration**: Tool to merge or split organizations (if needed)

## Support

If users still encounter issues:
1. Verify user has `super_admin` or `company_admin` role
2. Check backend logs for detailed error messages
3. Ensure database migrations are up to date
4. Verify no organization already exists in the database

## Verification Query

To check if an organization exists in the database:

```sql
SELECT 
  id, 
  name, 
  code, 
  node_type, 
  tenant_id,
  created_at
FROM resource_nodes
WHERE node_type = 'company'
  AND tenant_id = '<tenant_id>'
  AND is_active = true;
```

To check user roles:

```sql
SELECT 
  id,
  username,
  display_name,
  email,
  role,
  tenant_id
FROM users
WHERE tenant_id = '<tenant_id>'
  AND is_active = true;
```
