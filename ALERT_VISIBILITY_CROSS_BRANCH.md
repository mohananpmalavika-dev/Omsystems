# Cross-Branch Alert Visibility

## Overview

The alert system has been enhanced to support cross-branch visibility, allowing eligible users to view alerts from all branches they have access to, not just their assigned branch.

## What Changed

### 1. API Layer (`src/routes/ai-alerts.routes.ts`)

**Endpoint**: `GET /api/v1/ai/alerts` and `GET /v1/ai/alerts`

**New Query Parameters**:
- `branchId` (string, optional): Filter alerts from a single branch (backward compatible)
- `branchIds` (string or array, optional): Filter alerts from multiple branches (comma-separated or array)

**Examples**:
```bash
# Get alerts from a single branch (existing behavior)
GET /v1/ai/alerts?branchId=branch-123

# Get alerts from multiple branches (new feature)
GET /v1/ai/alerts?branchIds=branch-123,branch-456,branch-789

# Get alerts from all branches (omit branch filters)
GET /v1/ai/alerts?tenantId=tenant-abc
```

### 2. Service Layer (`src/alerts/services/unified-ai-alert.service.ts`)

**Method**: `getAlerts(filter)`

**New Filter Options**:
- `branchId`: Single branch filter (backward compatible)
- `branchIds`: Array of branch IDs for multi-branch filtering

The service now supports both single and multi-branch filtering while maintaining backward compatibility.

### 3. Database Layer

#### Updated Type: `AnalyticsAlertFilters` (`src/control-plane-store.ts`)
```typescript
export interface AnalyticsAlertFilters {
  cameraId?: string | undefined;
  branchId?: string | undefined;      // Single branch (backward compatible)
  branchIds?: string[] | undefined;   // Multiple branches (new)
  status?: AnalyticsAlertStatus | undefined;
  severity?: AnalyticsAlert["severity"] | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
}
```

#### Updated Methods (`src/database/analytics-repository.ts`)

1. **`listAlerts(tenantId, filters)`**
   - Now supports `branchIds` array in addition to single `branchId`
   - Uses PostgreSQL `ANY()` operator for efficient multi-branch queries
   - Query: `WHERE camera.branch_node_id = ANY($3::uuid[])`

2. **`countAlerts(tenantId, filters)`**
   - Same multi-branch support for counting alerts by severity

3. **`getAlertsSummary(tenantId, filters)`**
   - Same multi-branch support for aggregate statistics

## Usage Examples

### Frontend/Dashboard Integration

```typescript
// Get alerts for a specific user based on their branch access
const userBranchIds = user.branchScope; // e.g., ["branch-1", "branch-2", "branch-3"]

// Fetch alerts from all accessible branches
const response = await fetch(`/v1/ai/alerts?branchIds=${userBranchIds.join(',')}`);
const { data: alerts } = await response.json();

// Or using the API client
const alerts = await api.getAlerts({
  branchIds: userBranchIds,
  status: 'active',
  severity: 'P1'
});
```

### Role-Based Access Examples

```typescript
// Super Admin / Tenant Admin - See all branches
if (user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN') {
  // Omit branchIds to see all branches
  const alerts = await api.getAlerts({ tenantId: user.tenantId });
}

// Branch Manager - See only their branches
if (user.role === 'BRANCH_MANAGER') {
  const alerts = await api.getAlerts({ 
    branchIds: user.branchScope // e.g., ["branch-123"]
  });
}

// Regional Manager - See all branches in their region
if (user.role === 'REGION_MANAGER') {
  const regionBranches = await getRegionBranches(user.regionId);
  const alerts = await api.getAlerts({ 
    branchIds: regionBranches.map(b => b.id)
  });
}

// Zone Manager - See all branches in their zone
if (user.role === 'ZONE_MANAGER') {
  const zoneBranches = await getZoneBranches(user.zoneId);
  const alerts = await api.getAlerts({ 
    branchIds: zoneBranches.map(b => b.id)
  });
}
```

## Authorization & Security

### ABAC Integration

The alert visibility is still governed by the Attribute-Based Access Control (ABAC) system:

1. **Branch Scope Check**: Users can only see alerts from branches in their `branchScope`
2. **Role-Based Access**: Certain roles (SUPER_ADMIN, TENANT_ADMIN) bypass branch restrictions
3. **Camera Classification**: Sensitive cameras (VAULT_STRONG_ROOM) require elevated permissions

### Implementation Notes

- The `branchIds` parameter should be validated against the user's `branchScope` at the API gateway or middleware level
- For security, never trust client-provided `branchIds` directly - always intersect with user's authorized branches
- The database queries use parameterized statements to prevent SQL injection

### Recommended Middleware

```typescript
// Example middleware to enforce branch scope
async function validateBranchAccess(request: FastifyRequest) {
  const user = request.currentUser;
  const requestedBranchIds = request.query.branchIds;
  
  // Super admins can access all branches
  if (user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN') {
    return requestedBranchIds;
  }
  
  // Regular users: intersect requested branches with authorized branches
  const userBranchScope = user.branchScope || [];
  
  if (userBranchScope.includes('ALL')) {
    return requestedBranchIds;
  }
  
  // Filter to only branches the user has access to
  const authorizedBranchIds = requestedBranchIds.filter(
    branchId => userBranchScope.includes(branchId)
  );
  
  return authorizedBranchIds;
}
```

## Performance Considerations

1. **Database Indexing**: Ensure `branch_node_id` column in `cameras` table is indexed
   ```sql
   CREATE INDEX IF NOT EXISTS idx_cameras_branch_node_id 
   ON cameras(branch_node_id);
   ```

2. **Query Optimization**: The `ANY()` operator is efficient for PostgreSQL with proper indexes
   
3. **Pagination**: Use the `limit` parameter to paginate large result sets

4. **Caching**: Consider caching branch scope lookups for frequently accessed users

## Migration Path

### Backward Compatibility

All existing code continues to work without changes:
- Single `branchId` parameter still works as before
- Omitting both `branchId` and `branchIds` returns all alerts (subject to tenant filtering)

### Gradual Rollout

1. **Phase 1**: Deploy backend changes (API + database)
2. **Phase 2**: Update dashboard to use `branchIds` for multi-branch users
3. **Phase 3**: Update mobile app and other clients

### Testing Scenarios

```typescript
// Test 1: Single branch (backward compatibility)
const alerts1 = await api.getAlerts({ branchId: 'branch-123' });

// Test 2: Multiple branches
const alerts2 = await api.getAlerts({ branchIds: ['branch-123', 'branch-456'] });

// Test 3: All branches for tenant
const alerts3 = await api.getAlerts({ tenantId: 'tenant-abc' });

// Test 4: Combined filters
const alerts4 = await api.getAlerts({ 
  branchIds: ['branch-123', 'branch-456'],
  severity: 'P1',
  status: 'active'
});
```

## Future Enhancements

1. **Real-time Updates**: WebSocket support for cross-branch alert notifications
2. **Branch Grouping**: Predefined branch groups (region, zone, area) for easier filtering
3. **Alert Federation**: Aggregate alerts from multiple tenants (for MSPs)
4. **Smart Filtering**: ML-based alert prioritization across branches

## Related Files

- `src/routes/ai-alerts.routes.ts` - API endpoints
- `src/alerts/services/unified-ai-alert.service.ts` - Alert service
- `src/database/analytics-repository.ts` - Database queries
- `src/control-plane-store.ts` - Type definitions
- `src/security/abac/abac.service.ts` - Authorization logic

## Support

For questions or issues, refer to:
- Architecture documentation in `/docs`
- ABAC documentation in `src/security/abac/README.md`
- Alert system documentation in `src/alerts/README.md`
