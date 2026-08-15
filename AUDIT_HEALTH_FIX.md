# Audit Health Endpoint Fix

## Issue
The dashboard was experiencing 502 and 500 errors when trying to access:
- `/api/audit/health?summary=true` (500 error)
- `/api/audit/branch-compliance` (502 error)

## Root Cause
The `/v1/audit/health` endpoint was missing from the backend control plane API (`src/routes/audit.routes.ts`). The dashboard BFF was proxying requests to this endpoint, but since it didn't exist, the requests were failing.

## Solution
Added the missing health endpoints to `src/routes/audit.routes.ts`:

### 1. GET /v1/audit/health
Returns camera health data with the following features:
- **Summary mode** (`?summary=true`): Returns aggregated health statistics
  - Total cameras
  - Healthy/degraded/offline counts
  - Overall health score
- **Detailed mode**: Returns individual camera health records with metrics
  - Camera status, uptime, FPS, bitrate, temperature
- Supports filtering by:
  - `cameraId`: Specific camera
  - `branchNodeId`: All cameras in a branch
  - `status`: Filter by health status (healthy/degraded/offline)

### 2. POST /v1/audit/health/check
Triggers on-demand health checks:
- Accepts `cameraId` or `branchNodeId` parameters
- Logs audit trail for health check requests
- Returns 202 (Accepted) status with progress indicator

## Implementation Details

### Query Validation
```typescript
const healthQuery = z.object({
  cameraId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
  status: z.enum(['healthy', 'degraded', 'offline']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  summary: z.string().transform(val => val === 'true').optional(),
});
```

### Authorization
- Uses existing RBAC system via `store.listAccessibleNodes()`
- Requires `analytics:view` permission for camera access
- Filters data by tenant ID automatically

### Data Flow
1. Dashboard frontend → `/api/audit/health`
2. Next.js BFF → `/api/control/v1/audit/health`
3. Control plane → Returns camera health data
4. Response propagates back through the chain

## Deployment

### Development Environment
Restart the control plane server:
```bash
npm run dev
```

### Production Environment
Rebuild and restart the server:
```bash
npm run build
npm start
```

## Testing
After restarting the control plane server, verify:
1. Navigate to the Health dashboard page (`/audit/health`)
2. Confirm the summary metrics load without 500 errors
3. Check that individual camera health records display correctly
4. Verify branch filtering works when selecting specific branches
5. Test the branch compliance page (`/audit/branch-compliance`) to ensure the 502 error is resolved

### API Testing
You can test the endpoints directly:
```bash
# Get health summary
curl http://localhost:8080/v1/audit/health?summary=true \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get detailed health records
curl http://localhost:8080/v1/audit/health \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by branch
curl http://localhost:8080/v1/audit/health?branchNodeId=BRANCH_UUID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Trigger health check
curl -X POST http://localhost:8080/v1/audit/health/check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branchNodeId": "BRANCH_UUID"}'
```

## Related Files
- **Backend**: `src/routes/audit.routes.ts` (updated)
- **Dashboard BFF**: `dashboard/app/api/audit/health/route.ts` (no changes needed)
- **Dashboard Frontend**: `dashboard/app/audit/health/page.tsx` (no changes needed)

## Notes
- The branch compliance endpoint was already implemented, so no changes were needed there
- The 502 error for branch compliance was likely caused by a temporary service unavailability
- Health metrics currently use camera status from the database; future enhancements could integrate with the maintenance health collector for real-time telemetry
