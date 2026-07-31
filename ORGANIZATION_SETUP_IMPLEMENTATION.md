# Organization Setup Implementation

## Overview

This implementation adds functionality to create an organization when none exists, and prevents creating multiple organizations. The system ensures that only one company-level organization can be created per tenant.

## Changes Made

### 1. Updated Admin Page (`dashboard/app/admin/page.tsx`)

**Added Features:**
- Organization existence check on page load
- Conditional rendering based on organization existence
- Redirect to organization setup form if no organization exists
- Loading state while checking for organization

**Key Changes:**
- Added `hasOrganization` state to track if an organization exists
- Added `isLoadingOrg` state for loading feedback
- Added `checkOrganizationExists()` function to verify organization existence
- Added `handleOrganizationCreated()` callback to refresh after organization creation
- Conditional rendering:
  - Shows loading spinner while checking
  - Shows `CreateOrganizationForm` if no organization exists
  - Shows normal admin interface if organization exists

### 2. Created Organization Setup Form (`dashboard/components/create-organization-form.tsx`)

**Features:**
- Clean, user-friendly form for creating the company organization
- Comprehensive fields:
  - Basic Information: Name (required), Code, Description
  - Address: Street, City, State, Postal Code, Country
  - Contact Information: Contact Person, Email, Phone
- Form validation and error handling
- Responsive design with modern UI
- Success callback to notify parent component

**Form Sections:**
1. **Basic Information** - Essential company details
2. **Address** (Optional) - Company location information
3. **Contact Information** (Optional) - Primary contact details

### 3. Updated Organization Node Form (`dashboard/components/org-node-form.tsx`)

**Changes:**
- Prevented creation of root-level company nodes through this form
- Added validation to ensure company nodes can only be created through the setup form
- Error message displayed if attempting to create root node without parent

## User Flow

### First-Time Setup
1. User navigates to `/admin` page
2. System checks if organization exists by calling `/v1/organization/tree`
3. If no organization exists:
   - Display "Organization Setup" page
   - Show `CreateOrganizationForm` with company information fields
   - User fills in company details and submits
   - System creates company node without parent (root level)
   - After successful creation, page refreshes and shows normal admin interface

### Normal Operation
1. User navigates to `/admin` page
2. System checks if organization exists
3. If organization exists:
   - Display normal admin interface with tabs (Organization, Employees, Devices)
   - Show organization tree with existing company and hierarchy
   - Allow adding child nodes (headquarters, zones, regions, etc.)
   - Prevent adding additional company nodes

## Technical Implementation

### Organization Detection Logic

```typescript
const checkOrganizationExists = async () => {
  try {
    setIsLoadingOrg(true);
    const response = await organizationApi.getTree();
    // Check if there's at least one company node
    const hasCompany = response.data && response.data.length > 0;
    setHasOrganization(hasCompany);
  } catch (error) {
    console.error("Failed to check organization:", error);
    setHasOrganization(false);
  } finally {
    setIsLoadingOrg(false);
  }
};
```

### Organization Creation

```typescript
const payload: any = {
  nodeType: "company",
  name: formData.name.trim(),
  // No parentNodeId - this creates a root-level node
};

await organizationApi.createNode(payload);
```

## Security Considerations

1. **Backend Validation**: The backend enforces hierarchy rules through the `validate_resource_node_hierarchy()` trigger
2. **Permission Checks**: Only super_admin role can create root-level company nodes
3. **Single Organization**: Only one company node allowed per tenant (enforced by hierarchy validation)

## Database Schema

The organization hierarchy is enforced by:

1. **organizational_hierarchy_rules** table - Defines valid parent-child relationships
2. **validate_resource_node_hierarchy()** function - Validates relationships before insert/update
3. **enforce_hierarchy_rules** trigger - Applies validation automatically

## API Endpoints Used

- `GET /v1/organization/tree` - Check if organization exists
- `POST /v1/organization/nodes` - Create organization node
- `POST /v1/organization/validate-hierarchy` - Validate parent-child relationships

## UI/UX Features

### Organization Setup Form
- **Centered card layout** - Professional, focused design
- **Progressive disclosure** - Required fields first, optional sections below
- **Inline validation** - Real-time feedback on form fields
- **Loading states** - Clear feedback during submission
- **Error handling** - User-friendly error messages
- **Responsive design** - Works on all screen sizes

### Admin Page
- **Loading state** - Shows "Loading organization..." while checking
- **Conditional rendering** - Seamless transition between setup and normal mode
- **No manual toggle** - Automatically shows correct interface

## Testing Checklist

- [ ] First-time setup: Create organization when none exists
- [ ] Form validation: Submit with empty required fields
- [ ] Form validation: Submit with invalid email
- [ ] Error handling: Network error during creation
- [ ] Success flow: Organization created and page refreshes
- [ ] Normal operation: Existing organization shows admin interface
- [ ] Hierarchy enforcement: Cannot create additional company nodes
- [ ] Permission check: Only super_admin can create organization
- [ ] Multiple tenants: Each tenant can have one organization

## Future Enhancements

1. **Organization Transfer** - Allow transferring organization ownership
2. **Organization Archive** - Soft delete with restore capability
3. **Multi-Organization** - Support for multiple organizations per tenant (if required)
4. **Organization Templates** - Pre-configured templates for common structures
5. **Bulk Import** - Import organization structure from CSV/Excel

## Troubleshooting

### Organization Not Detected
- Check `/v1/organization/tree` API response
- Verify user has permissions to view organization
- Check browser console for errors

### Cannot Create Organization
- Verify user has `super_admin` role
- Check backend logs for validation errors
- Ensure database migrations are applied

### Form Submission Fails
- Check network connectivity
- Verify API endpoint is accessible
- Review error message for specific validation failures

## Related Files

- `dashboard/app/admin/page.tsx` - Main admin page with conditional rendering
- `dashboard/components/create-organization-form.tsx` - Organization setup form
- `dashboard/components/org-node-form.tsx` - Child node creation form
- `dashboard/components/organization-tree.tsx` - Organization tree display
- `dashboard/lib/api-client.ts` - API client methods
- `src/routes/organization.routes.ts` - Backend API routes
- `database/migrations/007_organizational_hierarchy.sql` - Database schema

## Support

For issues or questions, please contact the development team or refer to the main project documentation.
