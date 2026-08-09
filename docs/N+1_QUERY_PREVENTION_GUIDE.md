# N+1 Query Prevention Guide

## What is an N+1 Query Problem?

An N+1 query problem occurs when you:
1. Fetch a list of N records (1 query)
2. Loop through those records and fetch related data for each one (N queries)
3. Result: 1 + N total queries instead of 2 queries

This causes severe performance degradation as the dataset grows.

## Example of the Problem

### ❌ BAD - N+1 Pattern
```typescript
// Fetch 200 alerts (1 query)
const alerts = await store.listAnalyticsAlerts(tenantId, { limit: 200 });

// Loop and fetch camera for each alert (200 queries!)
for (const alert of alerts) {
  const camera = await store.getCamera(alert.cameraId);  // ❌ N+1 PROBLEM
  // ... use camera ...
}
```

**Result**: 201 database queries for 200 alerts

### ✅ GOOD - Batch Query Pattern
```typescript
// Fetch 200 alerts (1 query)
const alerts = await store.listAnalyticsAlerts(tenantId, { limit: 200 });

// Extract unique camera IDs
const cameraIds = [...new Set(alerts.map(alert => alert.cameraId))];

// Fetch all cameras in one query (1 query)
const cameras = await store.listCamerasByIds(cameraIds);

// Create lookup map for O(1) access
const camerasById = new Map(cameras.map(c => [c.id, c]));

// Use in-memory lookups
for (const alert of alerts) {
  const camera = camerasById.get(alert.cameraId);  // ✅ In-memory lookup
  // ... use camera ...
}
```

**Result**: 2 database queries for 200 alerts

## Available Batch Query Methods

Use these methods instead of single-record getters in loops:

### Cameras
```typescript
// ❌ Don't use in loops
await store.getCamera(cameraId)

// ✅ Use instead
await store.listCamerasByIds(cameraIds: string[]): Promise<Camera[]>
```

### Resource Nodes (Branches, Regions, etc.)
```typescript
// ❌ Don't use in loops
await store.getNode(nodeId)

// ✅ Use instead
await store.listNodesByIds(nodeIds: string[]): Promise<ResourceNode[]>
```

### Analytics Rules
```typescript
// ❌ Don't use in loops
await store.listAnalyticsRules(cameraId)

// ✅ Use instead
await store.listAnalyticsRulesByCameraIds(cameraIds: string[]): Promise<AnalyticsRule[]>
```

### Alert Notifications
```typescript
// ❌ Don't use in loops
await store.listAlertNotifications(tenantId, alertId)

// ✅ Use instead
await store.listAlertNotificationsByAlertIds(tenantId, alertIds: string[]): Promise<AlertNotification[]>
```

## Pattern: Batch Fetch and Map

This is the standard pattern to avoid N+1 queries:

```typescript
// 1. Fetch your main data
const mainRecords = await store.listSomething(...);

// 2. Extract unique IDs for related data
const relatedIds = [...new Set(mainRecords.map(r => r.relatedId))];

// 3. Batch fetch related data
const relatedRecords = await store.listRelatedByIds(relatedIds);

// 4. Create lookup map
const relatedById = new Map(relatedRecords.map(r => [r.id, r]));

// 5. Use in-memory lookups
for (const record of mainRecords) {
  const related = relatedById.get(record.relatedId);
  // ... use related ...
}
```

## Pattern: Multiple Relations

When you need to fetch multiple types of related data:

```typescript
// Fetch main data
const alerts = await store.listAnalyticsAlerts(tenantId, { limit: 200 });

// Extract all IDs
const cameraIds = [...new Set(alerts.map(a => a.cameraId))];
const alertIds = alerts.map(a => a.id);

// Batch fetch all related data in parallel
const [cameras, rules, notifications] = await Promise.all([
  store.listCamerasByIds(cameraIds),
  store.listAnalyticsRulesByCameraIds(cameraIds),
  store.listAlertNotificationsByAlertIds(tenantId, alertIds),
]);

// Create lookup maps
const camerasById = new Map(cameras.map(c => [c.id, c]));
const rulesByCameraId = new Map<string, AnalyticsRule[]>();
for (const rule of rules) {
  const list = rulesByCameraId.get(rule.cameraId) ?? [];
  list.push(rule);
  rulesByCameraId.set(rule.cameraId, list);
}

// Use lookups
for (const alert of alerts) {
  const camera = camerasById.get(alert.cameraId);
  const rules = rulesByCameraId.get(alert.cameraId) ?? [];
  // ... use data ...
}
```

## How to Detect N+1 Problems

### Code Review Checklist
Look for these patterns:

1. **Loop + await store.get***
   ```typescript
   for (const item of items) {
     await store.getCamera(...)  // ❌ RED FLAG
     await store.getNode(...)    // ❌ RED FLAG
   }
   ```

2. **Loop + await store.list* with single ID**
   ```typescript
   for (const camera of cameras) {
     await store.listAnalyticsRules(camera.id)  // ❌ RED FLAG
   }
   ```

3. **Nested data fetching**
   ```typescript
   for (const branch of branches) {
     for (const nodeId of branch.path) {
       await store.getNode(nodeId)  // ❌ RED FLAG
     }
   }
   ```

### Runtime Detection
Enable query logging and look for:
- High query counts per request (>10 for simple operations)
- Repeated similar queries with different parameters
- Query time proportional to result count (linear scaling = bad)

## Performance Impact

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| 200 alerts, 150 cameras | 201 queries | 2 queries | 99% |
| 500 branches, depth 5 | 2,500 queries | 1 query | 99.96% |
| Alert command center page | 800+ queries | 5 queries | 99.4% |

## When to Add New Batch Methods

If you find yourself needing to call `getX()` in a loop and no batch method exists:

1. Add interface to `ControlPlaneStore`:
   ```typescript
   listXByIds(ids: string[]): Promise<X[]>;
   ```

2. Implement in `PostgresStore`:
   ```typescript
   async listXByIds(ids: string[]) {
     return this.x.listByIds(ids);
   }
   ```

3. Implement in `InMemoryStore`:
   ```typescript
   async listXByIds(ids: string[]) {
     const idSet = new Set(ids);
     return [...this.xRecords.values()].filter(x => idSet.has(x.id));
   }
   ```

4. Use the new method with the batch pattern above

## Questions?

If you're unsure whether your code has an N+1 problem:
1. Count the `await` statements inside your loops
2. If >0, you probably have an N+1 problem
3. Refactor using the batch query pattern above
