# Gateway Delete 404 Error - FIXED ✅

## Problem
When trying to delete a gateway from the System Management page, the request was failing with:
```
DELETE https://sentinel-grid-monitoring1.onrender.com/api/admin/system/gateway/6fa95d55... 404 (Not Found)
```

## Root Cause
**Frontend-Backend Mismatch:**
- **Frontend** was using singular forms: `gateway`, `camera`, `branch`
- **Backend** API routes use plural forms: `gateways`, `cameras`, `branches`

The `handleDelete` function in `dashboard/app/admin/system/page.tsx` (line 101) was calling:
```typescript
fetch(`/api/admin/system/${type}/${id}`, { method: 'DELETE' })
```

When `type` was `'gateway'`, it created the URL `/api/admin/system/gateway/...` but the actual route is `/api/admin/system/gateways/...`

## Solution
Added pluralization logic to the `handleDelete` function:

```typescript
const handleDelete = async (type: 'gateway' | 'camera' | 'branch', id: string) => {
  // Pluralize the type for the API endpoint
  const pluralType = type === 'gateway' ? 'gateways' 
    : type === 'camera' ? 'cameras' 
    : 'branches';
  
  const response = await fetch(`/api/admin/system/${pluralType}/${id}`, {
    method: 'DELETE',
  });
  // ... rest of the function
}
```

## Changes Made
✅ Modified `dashboard/app/admin/system/page.tsx`
✅ Git committed: `55bad9c`
✅ Pushed to GitHub main branch
✅ Render auto-deploy triggered

## Testing
Once deployed, you should be able to:
1. Go to Admin → System Management
2. Click on Gateways, Cameras, or Branches tab
3. Click "Delete" on any item
4. Confirm deletion
5. Item should be deleted successfully (no 404 error)

## Notes
- The same pluralization logic now works for all three types:
  - `gateway` → `gateways`
  - `camera` → `cameras`
  - `branch` → `branches`
- The "Delete All" button in the same page already used plural forms, so it was working correctly
