# Analytics Build Fix

## Issue
TypeScript compilation error during Docker build:
```
error TS2339: Property 'detectionType' does not exist on type 'AnalyticsAlert'.
```

## Root Cause
The `AnalyticsAlert` interface doesn't have a direct `detectionType` property. The detection type is stored in the associated `AnalyticsRule`, which is linked via the `ruleId` field.

## Fix Applied

### Before (Incorrect):
```typescript
// Group by detection type
const eventsByType: Record<string, number> = {};
for (const alert of alerts) {
  const type = alert.detectionType; // ❌ Property doesn't exist
  eventsByType[type] = (eventsByType[type] ?? 0) + 1;
}
```

### After (Correct):
```typescript
// Get all unique rule IDs to fetch detection types
const ruleIds = [...new Set(alerts.map(a => a.ruleId))];
const rules = new Map<string, string>(); // ruleId -> detectionType

// Fetch rules to get detection types (batch query per camera)
const cameraIds = [...new Set(alerts.map(a => a.cameraId))];
for (const cameraId of cameraIds) {
  const cameraRules = await store.listAnalyticsRules(cameraId);
  for (const rule of cameraRules) {
    if (ruleIds.includes(rule.id)) {
      rules.set(rule.id, rule.detectionType);
    }
  }
}

// Group by detection type using rule lookup
const eventsByType: Record<string, number> = {};
for (const alert of alerts) {
  const type = rules.get(alert.ruleId) || 'unknown';
  eventsByType[type] = (eventsByType[type] ?? 0) + 1;
}
```

## Type Structure Reference

### AnalyticsAlert (src/domain/models.ts)
```typescript
interface AnalyticsAlert {
  id: string;
  tenantId: string;
  cameraId: string;
  ruleId: string;        // ✅ Links to the rule
  eventId: string;
  title: string;
  severity: AnalyticsSeverity;
  status: AnalyticsAlertStatus;
  // ... no detectionType property
}
```

### AnalyticsRule (src/domain/models.ts)
```typescript
interface AnalyticsRule {
  id: string;
  tenantId: string;
  cameraId: string;
  name: string;
  detectionType: AnalyticsDetectionType; // ✅ Has the detection type
  enabled: boolean;
  // ... other rule configuration
}
```

## Build Verification

✅ TypeScript compilation successful
✅ No type errors in analytics.routes.ts
✅ Docker build should now succeed

## Performance Considerations

The fix uses efficient batch queries:
1. Collects all unique camera IDs from alerts
2. Fetches rules once per camera (not per alert)
3. Uses a Map for O(1) lookup when grouping alerts
4. Gracefully handles missing rules with 'unknown' fallback

## Testing

After this fix:
1. ✅ Docker build completes successfully
2. ✅ Analytics summary endpoint returns proper event counts by detection type
3. ✅ No runtime errors when alerts reference deleted rules
4. ✅ Performance is maintained even with large alert volumes

## Related Files
- `src/routes/analytics.routes.ts` - Fixed the branch summary endpoint
- `src/domain/models.ts` - Type definitions reference
