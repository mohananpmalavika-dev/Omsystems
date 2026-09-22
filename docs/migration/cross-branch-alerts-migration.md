# Migration Guide: Cross-Branch Alert Visibility

## Overview

This guide helps you migrate from single-branch alert queries to the new multi-branch alert system.

## Breaking Changes

**None.** This is a backward-compatible change. All existing code continues to work without modifications.

## What You Should Update (Recommended)

While not required, updating your code to use the new multi-branch features provides better user experience for regional, zone, and multi-branch managers.

## Migration Steps by Role

### 1. Super Admin / Tenant Admin

**Before:**
```typescript
// Old: Explicitly query without branch filter
const alerts = await api.getAlerts({ 
  tenantId: user.tenantId 
});
```

**After (recommended):**
```typescript
// New: Same behavior, but more explicit
const alerts = await api.getAlerts({ 
  tenantId: user.tenantId,
  // Omit branchIds to see all branches
});
```

**No code change required** - this role already sees all branches.

---

### 2. Regional Manager

**Before:**
```typescript
// Old: Had to make multiple API calls
const alerts = [];
for (const branchId of user.branchScope) {
  const branchAlerts = await api.getAlerts({ branchId });
  alerts.push(...branchAlerts);
}
```

**After:**
```typescript
// New: Single API call for all branches
const alerts = await api.getAlerts({ 
  branchIds: user.branchScope 
});
```

**Benefits:**
- ✅ Single API call instead of N calls
- ✅ Faster page load times
- ✅ Less server load
- ✅ Consistent sorting across branches

---

### 3. Zone Manager / Area Manager

**Before:**
```typescript
// Old: Fetch region, then branches, then alerts
const zone = await api.getZone(user.zoneId);
const branches = await api.getZoneBranches(user.zoneId);

const alerts = [];
for (const branch of branches) {
  const branchAlerts = await api.getAlerts({ branchId: branch.id });
  alerts.push(...branchAlerts);
}
```

**After:**
```typescript
// New: Fetch branches and alerts in parallel
const [zone, branches] = await Promise.all([
  api.getZone(user.zoneId),
  api.getZoneBranches(user.zoneId),
]);

const alerts = await api.getAlerts({ 
  branchIds: branches.map(b => b.id) 
});
```

**Benefits:**
- ✅ Parallel fetching
- ✅ Reduced API calls from (1 + 1 + N) to (2 + 1)
- ✅ Better performance

---

### 4. Branch Manager

**Before:**
```typescript
// Old: Query single branch
const alerts = await api.getAlerts({ 
  branchId: user.branchId 
});
```

**After (optional):**
```typescript
// New: Still works, or use array syntax for consistency
const alerts = await api.getAlerts({ 
  branchIds: [user.branchId] 
});

// Or keep the old syntax - both work!
const alerts = await api.getAlerts({ 
  branchId: user.branchId 
});
```

**No code change required** - single branch queries still work.

---

### 5. SOC Operator / Virtual Guard

**Before:**
```typescript
// Old: Limited to assigned branch
const alerts = await api.getAlerts({ 
  branchId: user.assignedBranchId 
});
```

**After:**
```typescript
// New: Can see alerts from all assigned branches
const alerts = await api.getAlerts({ 
  branchIds: user.branchScope // May include multiple branches
});
```

**Benefits:**
- ✅ Operators can now monitor multiple branches
- ✅ Better resource utilization
- ✅ Improved incident response

---

## Code Pattern Updates

### Pattern 1: Dashboard Alert List

**Before:**
```typescript
// Old approach - single branch
function AlertDashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    api.getAlerts({ branchId: user.branchId })
      .then(response => setAlerts(response.data));
  }, [user.branchId]);

  return <AlertList alerts={alerts} />;
}
```

**After:**
```typescript
// New approach - multi-branch
function AlertDashboard() {
  const { user } = useAuth();
  const branchIds = user.branchScope || [user.branchId];
  
  const { data: alerts } = useQuery({
    queryKey: ['alerts', branchIds],
    queryFn: () => api.getAlerts({ branchIds }),
  });

  return <AlertList alerts={alerts} groupBy="branch" />;
}
```

---

### Pattern 2: Alert Statistics

**Before:**
```typescript
// Old: Separate query per branch
async function getAlertStats(branchIds: string[]) {
  const stats = [];
  
  for (const branchId of branchIds) {
    const alerts = await api.getAlerts({ branchId });
    stats.push({
      branchId,
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'P1').length,
    });
  }
  
  return stats;
}
```

**After:**
```typescript
// New: Single query, client-side grouping
async function getAlertStats(branchIds: string[]) {
  const alerts = await api.getAlerts({ branchIds });
  
  // Group by branch
  const statsByBranch = alerts.reduce((acc, alert) => {
    if (!acc[alert.branchId]) {
      acc[alert.branchId] = { total: 0, critical: 0 };
    }
    acc[alert.branchId].total++;
    if (alert.severity === 'P1') {
      acc[alert.branchId].critical++;
    }
    return acc;
  }, {} as Record<string, { total: number; critical: number }>);
  
  return Object.entries(statsByBranch).map(([branchId, stats]) => ({
    branchId,
    ...stats,
  }));
}
```

---

### Pattern 3: Real-Time Updates

**Before:**
```typescript
// Old: Subscribe to single branch
function useRealtimeAlerts(branchId: string) {
  useEffect(() => {
    const channel = pusher.subscribe(`branch-${branchId}-alerts`);
    channel.bind('alert-created', handleAlertCreated);
    
    return () => channel.unsubscribe();
  }, [branchId]);
}
```

**After:**
```typescript
// New: Subscribe to multiple branches
function useRealtimeAlerts(branchIds: string[]) {
  useEffect(() => {
    const channels = branchIds.map(branchId => {
      const channel = pusher.subscribe(`branch-${branchId}-alerts`);
      channel.bind('alert-created', handleAlertCreated);
      return channel;
    });
    
    return () => {
      channels.forEach(channel => channel.unsubscribe());
    };
  }, [branchIds.join(',')]); // Use join for stable dependency
}
```

---

## Database Query Updates

If you have custom database queries, update them to use the new pattern:

**Before:**
```sql
-- Old: Single branch filter
SELECT * FROM analytics_alerts 
WHERE tenant_id = $1 
  AND branch_id = $2
ORDER BY last_detected_at DESC;
```

**After:**
```sql
-- New: Multi-branch filter with ANY operator
SELECT * FROM analytics_alerts 
WHERE tenant_id = $1 
  AND branch_id = ANY($2::uuid[])
ORDER BY last_detected_at DESC;
```

---

## API Endpoint Updates

### REST API

**Before:**
```bash
# Old: Query single branch
GET /v1/ai/alerts?branchId=branch-123
```

**After:**
```bash
# New: Query multiple branches (comma-separated)
GET /v1/ai/alerts?branchIds=branch-123,branch-456,branch-789

# Or using array syntax (if your client supports it)
GET /v1/ai/alerts?branchIds[]=branch-123&branchIds[]=branch-456
```

### GraphQL (if applicable)

**Before:**
```graphql
query GetAlerts($branchId: ID!) {
  alerts(branchId: $branchId) {
    id
    severity
    title
  }
}
```

**After:**
```graphql
query GetAlerts($branchIds: [ID!]) {
  alerts(branchIds: $branchIds) {
    id
    severity
    title
    branch {
      id
      name
    }
  }
}
```

---

## Testing Updates

Update your tests to cover multi-branch scenarios:

```typescript
// Add new test cases
describe('Alert API', () => {
  // Existing test - still valid
  it('should fetch alerts for single branch', async () => {
    const alerts = await api.getAlerts({ branchId: 'branch-1' });
    expect(alerts).toHaveLength(5);
  });

  // New test - multi-branch
  it('should fetch alerts for multiple branches', async () => {
    const alerts = await api.getAlerts({ 
      branchIds: ['branch-1', 'branch-2', 'branch-3'] 
    });
    
    expect(alerts).toHaveLength(15);
    expect(alerts.filter(a => a.branchId === 'branch-1')).toHaveLength(5);
    expect(alerts.filter(a => a.branchId === 'branch-2')).toHaveLength(5);
    expect(alerts.filter(a => a.branchId === 'branch-3')).toHaveLength(5);
  });

  // New test - branch scope authorization
  it('should only return alerts from authorized branches', async () => {
    const user = { branchScope: ['branch-1', 'branch-2'] };
    const alerts = await api.getAlerts({ 
      branchIds: user.branchScope 
    });
    
    alerts.forEach(alert => {
      expect(user.branchScope).toContain(alert.branchId);
    });
  });
});
```

---

## Performance Considerations

### Before Migration
- **N+1 queries**: One query per branch
- **Sequential processing**: Branches queried one by one
- **High latency**: (N branches × query time)

### After Migration
- **Single query**: One query for all branches
- **Database-level filtering**: PostgreSQL `ANY()` operator
- **Low latency**: ~constant time regardless of branch count

### Example Performance Improvement

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| 1 branch | 100ms | 100ms | 0% |
| 5 branches | 500ms | 120ms | **76% faster** |
| 10 branches | 1000ms | 150ms | **85% faster** |
| 50 branches | 5000ms | 300ms | **94% faster** |

---

## Rollback Plan

If you need to rollback, the system supports both old and new query patterns:

1. **Keep using `branchId`** - Single branch queries still work
2. **No API version changes** - Same endpoints
3. **No data migration needed** - Database schema unchanged

---

## Troubleshooting

### Issue: "Alerts not showing for some branches"

**Cause**: User's `branchScope` doesn't include those branches

**Solution**: 
```typescript
// Verify user's branch access
console.log('User branch scope:', user.branchScope);

// Check if specific branch is accessible
const hasAccess = user.branchScope.includes(targetBranchId);
```

---

### Issue: "Query is slow with many branches"

**Cause**: Missing database index

**Solution**:
```sql
-- Ensure index exists on branch_node_id
CREATE INDEX IF NOT EXISTS idx_cameras_branch_node_id 
ON cameras(branch_node_id);

-- Verify index is being used
EXPLAIN ANALYZE 
SELECT * FROM analytics_alerts 
WHERE camera_id IN (
  SELECT id FROM cameras WHERE branch_node_id = ANY($1)
);
```

---

### Issue: "Duplicate alerts appearing"

**Cause**: Incorrect array handling in API call

**Solution**:
```typescript
// Wrong - passing array as string
const alerts = await api.getAlerts({ 
  branchIds: branchIds.toString() // ❌ Don't do this
});

// Correct - pass array directly
const alerts = await api.getAlerts({ 
  branchIds: branchIds // ✅ Correct
});
```

---

## Checklist

Before completing your migration:

- [ ] Update API calls to use `branchIds` for multi-branch users
- [ ] Update dashboard components to display branch information
- [ ] Add branch grouping/filtering in UI
- [ ] Update tests to cover multi-branch scenarios
- [ ] Verify database indexes are in place
- [ ] Update documentation for your team
- [ ] Train users on new cross-branch visibility
- [ ] Monitor performance metrics after deployment

---

## Need Help?

- Check the main documentation: [ALERT_VISIBILITY_CROSS_BRANCH.md](../../ALERT_VISIBILITY_CROSS_BRANCH.md)
- Review examples: [cross-branch-alerts-integration.md](../examples/cross-branch-alerts-integration.md)
- Contact the platform team
- Open a support ticket

---

## Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| **Phase 1: Backend** | Week 1 | Deploy API changes, verify backward compatibility |
| **Phase 2: Dashboard** | Week 2 | Update dashboard to use new API |
| **Phase 3: Mobile** | Week 3 | Update mobile apps |
| **Phase 4: Monitoring** | Week 4+ | Monitor performance, gather feedback |

---

## Success Metrics

Track these metrics post-migration:

1. **API Performance**
   - Average response time for multi-branch queries
   - Number of API calls reduced
   
2. **User Experience**
   - Time to view alerts across all branches
   - User satisfaction scores
   
3. **System Health**
   - Database query performance
   - Error rates
   - Cache hit rates

---

Last updated: 2026-09-22
