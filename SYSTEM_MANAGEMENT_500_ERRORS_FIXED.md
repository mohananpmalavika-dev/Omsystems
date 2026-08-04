# System Management 500 Errors - Fixed

## Issue Summary
The System Management page was showing 500 errors for branches and gateways endpoints because the dashboard was calling non-existent backend API endpoints.

## Root Cause
1. **Branches endpoint**: Dashboard was calling `/v1/branches` but backend doesn't have this endpoint
2. **Gateways endpoint**: Dashboard was fetching branches from non-existent `/v1/branches` endpoint before fetching edge agents

## Backend API Structure (Actual)
The backend (`src/app.ts`) provides:
- `/v1/organization/nodes?type=branch` - Lists all branches
- `/v1/branches/:branchId/edge-agents` - Lists edge agents for a specific branch

## Solution Applied

### 1. Fixed Branches Route (`dashboard/app/api/admin/system/branches/route.ts`)
**Before:**
```typescript
const response = await fetch(`${controlPlaneUrl}/v1/branches`, {
  method: 'GET',
  headers,
});
```

**After:**
```typescript
const response = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
  method: 'GET',
  headers,
});
```

### 2. Fixed Gateways Route (`dashboard/app/api/admin/system/gateways/route.ts`)
**Before:**
```typescript
const branchesResponse = await fetch(`${controlPlaneUrl}/v1/branches`, {
  method: 'GET',
  headers,
});
```

**After:**
```typescript
const branchesResponse = await fetch(`${controlPlaneUrl}/v1/organization/nodes?type=branch`, {
  method: 'GET',
  headers,
});
```

### 3. Added Better Error Logging
Added detailed error logging to help diagnose issues:
```typescript
if (!response.ok) {
  console.error(`Failed to fetch: ${response.status} ${response.statusText}`);
  const text = await response.text();
  console.error(`Response body: ${text}`);
  return NextResponse.json([], { status: 200 });
}
```

## How It Works Now

### Branches Tab
1. Dashboard calls `/api/admin/system/branches`
2. Proxy calls backend `/v1/organization/nodes?type=branch`
3. Backend returns all branches from organization hierarchy
4. Dashboard displays branches with name and ID

### Gateways Tab
1. Dashboard calls `/api/admin/system/gateways`
2. Proxy calls `/v1/organization/nodes?type=branch` to get all branches
3. For each branch, proxy calls `/v1/branches/{branchId}/edge-agents`
4. Aggregates all edge agents from all branches
5. Dashboard displays gateways with branch name, status, last seen time

## Files Changed
- `dashboard/app/api/admin/system/branches/route.ts` - Changed endpoint from `/v1/branches` to `/v1/organization/nodes?type=branch`
- `dashboard/app/api/admin/system/gateways/route.ts` - Changed branch fetch endpoint and added better error logging

## Expected Results
- ✅ No more 500 errors on System Management page
- ✅ Branches tab shows all branches in the organization hierarchy
- ✅ Gateways tab shows all edge agents across all branches
- ✅ Better error logging for troubleshooting

## Testing Steps
1. Deploy the dashboard changes to Render
2. Navigate to Admin → System Management
3. Click "Branches" tab - should show branches without 500 errors
4. Click "Gateways" tab - should show edge agents without 500 errors
5. Check browser console for any remaining errors
6. Check Render logs for detailed error messages if issues persist

## Notes
- The backend uses a hierarchical organization structure (company → division → region → branch)
- `/v1/branches` endpoint exists but requires authentication and action parameter
- `/v1/organization/nodes` is the correct way to list all nodes of a specific type
- Edge agents are always scoped to a branch (no global list endpoint exists)
