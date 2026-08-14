# Maintenance Page Fix - Deployment Guide

## Problem
The `/audit/maintenance` page was showing "This page couldn't load" error because the Next.js API routes couldn't connect to the backend control plane.

## Root Cause
The API routes in `dashboard/app/api/audit/maintenance/` were using `process.env.NEXT_PUBLIC_API_URL` which:
1. Was not set in the production environment
2. Had an incorrect default fallback (`http://localhost:3000` instead of `http://localhost:8080`)
3. Should use standard server-side environment variables, not `NEXT_PUBLIC_` prefixed ones

## Changes Made

### 1. Updated Environment Files

#### `dashboard/.env.local`
Added:
```
NEXT_PUBLIC_API_URL=https://sentinel-grid-control-plane1.onrender.com
```

#### `dashboard/.env.production`
Updated:
```
CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
NEXT_PUBLIC_API_URL=https://sentinel-grid-control-plane1.onrender.com
```

### 2. Fixed API Routes

Updated both:
- `dashboard/app/api/audit/maintenance/route.ts`
- `dashboard/app/api/audit/maintenance/[id]/route.ts`

Changed from:
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
```

To:
```typescript
// Use server-side env variables for API routes
const API_BASE_URL = process.env.CONTROL_PLANE_URL || 
                      process.env.CONTROL_PLANE_INTERNAL_URL || 
                      process.env.NEXT_PUBLIC_API_URL || 
                      'http://localhost:8080';
```

This provides a proper fallback chain that works in all environments.

## Deployment Steps

### Option 1: If Using Render.com

1. **Go to your dashboard service on Render**
2. **Navigate to Environment variables**
3. **Add or update these variables:**
   ```
   CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
   CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane1.onrender.com
   ```
4. **Trigger a new deployment** or wait for auto-deploy from git push

### Option 2: If Using Vercel

1. **Go to your project settings on Vercel**
2. **Navigate to Environment Variables**
3. **Add these variables for Production:**
   ```
   CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
   CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane1.onrender.com
   ```
4. **Redeploy** your application

### Option 3: Manual Deployment

1. **Commit the changes:**
   ```bash
   git add dashboard/app/api/audit/maintenance/
   git add dashboard/.env.production
   git add dashboard/.env.local
   git commit -m "Fix maintenance page API connection issue"
   git push
   ```

2. **Rebuild the dashboard:**
   ```bash
   cd dashboard
   npm run build
   ```

3. **Restart your dashboard service**

## Verification

After deployment, verify the fix by:

1. **Navigate to** `https://your-dashboard-url/audit/maintenance`
2. **Check that the page loads** without the "This page couldn't load" error
3. **Verify that work orders are displayed** (or an empty state if no orders exist)
4. **Check browser console** for any remaining errors

## Backend Route Status

✅ Backend routes are properly configured:
- `GET /v1/maintenance/workorders` - registered in `src/routes/maintenance.routes.ts`
- `GET /v1/maintenance/workorders/:id` - registered
- `POST /v1/maintenance/workorders` - registered
- Route registration confirmed in `src/app.ts` via `registerMaintenanceRoutes()`

## Testing Locally

To test locally before deploying:

1. **Set environment variables:**
   ```bash
   cd dashboard
   export CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
   # or on Windows CMD:
   set CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
   # or on Windows PowerShell:
   $env:CONTROL_PLANE_URL="https://sentinel-grid-control-plane1.onrender.com"
   ```

2. **Run the dashboard:**
   ```bash
   npm run dev
   ```

3. **Test the page:**
   - Open `http://localhost:3000/audit/maintenance`
   - Should connect to the production backend
   - Verify no connection errors

## Additional Notes

- The maintenance routes require authentication via the `sentinel_access` cookie
- If you see 401/403 errors, ensure you're logged in to the dashboard
- The backend store methods (`listWorkOrders`, `getWorkOrder`, etc.) are properly implemented
- Summary statistics are fetched with the `?summary=true` query parameter

## Related Files

- Backend: `src/routes/maintenance.routes.ts`
- Frontend Page: `dashboard/app/audit/maintenance/page.tsx`
- API Proxy: `dashboard/app/api/audit/maintenance/route.ts`
- Store: `src/database/maintenance-repository.ts`
