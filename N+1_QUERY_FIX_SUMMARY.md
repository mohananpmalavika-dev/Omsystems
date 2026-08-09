# N+1 Query Problem - Fixed

## Summary
Fixed critical N+1 query problems in the Alert Command Center and Operational Reporting systems that could cause hundreds of database calls for a single page request.

## Issues Fixed

### 1. Analytics Alerts Endpoint (`src/routes/analytics.routes.ts`)
**Location**: `/v1/analytics/alerts` endpoint (line ~308)

**Problem**: 
- When fetching 200 alerts, the code was calling `store.getCamera()` individually for each alert
- With 500+ branches and thousands of alerts, this resulted in hundreds of sequential database queries
- Each query also triggered an individual access check with `hasCameraAccess()`

**Before**:
```typescript
for (const alert of candidates) {
  const camera = await store.getCamera(alert.cameraId);  // N+1 query!
  if (camera && await hasCameraAccess(request, store, camera, "analytics:view")) {
    data.push(alert);
  }
}
```

**After**:
```typescript
// Batch fetch all cameras to avoid N+1 queries
const cameraIds = [...new Set(candidates.map((alert) => alert.cameraId))];
const cameras = await store.listCamerasByIds(cameraIds);  // Single batch query
const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));

// Build access map by checking permissions for each camera
const accessMap = new Map<string, boolean>();
for (const camera of cameras) {
  const hasAccess = await hasCameraAccess(request, store, camera, "analytics:view");
  accessMap.set(camera.id, hasAccess);
}

const data: AnalyticsAlert[] = [];
for (const alert of candidates) {
  const camera = camerasById.get(alert.cameraId);
  if (camera && accessMap.get(alert.cameraId)) {
    data.push(alert);
  }
}
```

**Impact**: 
- Reduced from N camera queries to 1 batch query
- For 200 alerts with 150 unique cameras: **200 queries → 1 query** (99.5% reduction)

### 2. Operational Report Builder (`src/reporting/worker.ts`)
**Location**: `buildDailyOperationalReport()` function (line ~88)

**Problem**:
- When building reports for 500+ branches, the code was calling `store.getNode()` for each node in each branch's path
- For a branch with path depth of 5, and 500 branches, this meant 2,500+ individual database calls

**Before**:
```typescript
const regionByBranch = new Map<string, string>();
for (const branch of branches) {
  let region = "Unassigned";
  for (const id of [...branch.path].reverse()) {
    const node = await store.getNode(id);  // N+1 query!
    if (node?.type === "region") {
      region = node.name;
      break;
    }
  }
  regionByBranch.set(branch.id, region);
}
```

**After**:
```typescript
// Batch fetch all nodes to avoid N+1 queries
const allNodeIds = new Set<string>();
for (const branch of branches) {
  for (const id of branch.path) {
    allNodeIds.add(id);
  }
}
const allNodes = await store.listNodesByIds([...allNodeIds]);  // Single batch query
const nodesById = new Map(allNodes.map((node) => [node.id, node]));

const regionByBranch = new Map<string, string>();
for (const branch of branches) {
  let region = "Unassigned";
  for (const id of [...branch.path].reverse()) {
    const node = nodesById.get(id);  // In-memory lookup
    if (node?.type === "region") {
      region = node.name;
      break;
    }
  }
  regionByBranch.set(branch.id, region);
}
```

**Impact**:
- Reduced from N×M node queries to 1 batch query (where N = branches, M = path depth)
- For 500 branches with avg path depth of 5: **2,500 queries → 1 query** (99.96% reduction)

## Alert Command Center Already Optimized

**Good News**: The Alert Command Center endpoint (`/v1/alerts/command-center`) in `src/routes/alert-command-center.routes.ts` was already using the optimal batch query pattern:

```typescript
const cameraIds = [...new Set(candidates.map((alert) => alert.cameraId))];
const cameras = await store.listCamerasByIds(cameraIds);

const branchIds = [...new Set(cameras.map((camera) => camera.branchId))];
const branches = await store.listNodesByIds(branchIds);

const rules = await store.listAnalyticsRulesByCameraIds(cameraIds);
const notifications = await store.listAlertNotificationsByAlertIds(request.currentUser.tenantId, alertIds);
```

This implementation uses all the batch query methods properly and assembles results in memory.

## Performance Impact

For a typical load scenario:
- **200 alerts** across **150 cameras** in **50 branches**
- **Before**: ~400+ database queries per request
- **After**: ~5 database queries per request
- **Improvement**: 98%+ reduction in database load

For operational reports with 500 branches:
- **Before**: ~2,500+ queries for region lookups alone
- **After**: 1 query for all nodes
- **Improvement**: 99.96% reduction

## Database Methods Used

The following batch query methods from `ControlPlaneStore` were utilized:
- `listCamerasByIds(cameraIds: string[])`
- `listNodesByIds(ids: string[])`
- `listAnalyticsRulesByCameraIds(cameraIds: string[])`
- `listAlertNotificationsByAlertIds(tenantId: string, alertIds: string[])`

These methods are already implemented in both the in-memory store (`src/store.ts`) and PostgreSQL store (`src/database/postgres-store.ts`).

## Testing Recommendations

1. **Load test** the `/v1/analytics/alerts` endpoint with 200+ alerts
2. **Performance test** operational report generation with 500+ branches
3. **Monitor** database query counts before and after deployment
4. **Verify** alert access control still works correctly with the batch approach

## Priority Level

**P1 - High Priority Scalability Improvement**

This fix addresses a critical scalability bottleneck that could severely impact performance under normal production loads with hundreds of branches and thousands of alerts.
