# Branch Lifecycle Query Guide

## Overview

Branches now follow a lifecycle: **ACTIVE → DISABLED → ARCHIVED**. This document explains how to write queries that correctly handle branch lifecycle states.

## Quick Reference

| Query Purpose | Include | Exclude | SQL Snippet |
|--------------|---------|---------|-------------|
| **Operational monitoring** | ACTIVE only | DISABLED, ARCHIVED | `lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL` |
| **Branch management** | ACTIVE, DISABLED | ARCHIVED | `lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL` |
| **Historical reports** | ALL | None | No filter needed |

## Key Principles

### 1. **Operational Queries Should Exclude Disabled/Archived Branches**

Queries for monitoring, alerting, health checks, and SLA calculations should only consider **ACTIVE** branches.

**Examples:**
- Camera monitoring dashboards
- Active alert lists
- Health score calculations
- Recording compliance checks

**Why:** Disabled branches are temporarily inactive. Archived branches are permanently removed from operations.

### 2. **Management Queries Can Include Disabled Branches**

Branch administration, configuration, and setup views should show both **ACTIVE** and **DISABLED** branches.

**Examples:**
- Branch list pages
- Branch configuration screens
- Device assignment interfaces

**Why:** Administrators need to see and manage disabled branches (e.g., to reactivate them).

### 3. **Historical Queries Should Include All States**

Reports, audit trails, compliance evidence, and incident history should include branches in **all lifecycle states**.

**Examples:**
- Historical incident reports
- Audit logs
- Compliance certificates
- Forensic timelines

**Why:** Historical data must remain accurate. A branch that was active when an incident occurred should still appear in that incident's report, even if it's now archived.

## SQL Patterns

### Pattern 1: Active Branches Only (Operational)

```sql
SELECT *
FROM resource_nodes
WHERE tenant_id = $1
  AND node_type = 'branch'
  -- Only active branches
  AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL)
ORDER BY name;
```

**Use for:** Monitoring dashboards, active camera counts, health metrics

### Pattern 2: Operational Branches (Management)

```sql
SELECT *
FROM resource_nodes
WHERE tenant_id = $1
  AND node_type = 'branch'
  -- Active and disabled, but not archived
  AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)
ORDER BY name;
```

**Use for:** Branch admin pages, configuration UIs

### Pattern 3: All Branches (Historical)

```sql
SELECT *
FROM resource_nodes
WHERE tenant_id = $1
  AND node_type = 'branch'
  -- No lifecycle filter - include archived branches
ORDER BY name;
```

**Use for:** Historical reports, audit trails, compliance evidence

### Pattern 4: Cameras with Parent Branch Status

```sql
SELECT 
  c.*,
  bn.name as branch_name,
  bn.lifecycle_status as branch_status,
  CASE 
    WHEN bn.lifecycle_status = 'DISABLED' THEN 'DISABLED_BY_PARENT'
    WHEN bn.lifecycle_status = 'ARCHIVED' THEN 'ARCHIVED_BY_PARENT'
    ELSE 'OPERATIONAL'
  END as effective_status
FROM cameras c
JOIN resource_nodes bn ON bn.id = c.branch_node_id
WHERE c.tenant_id = $1
  -- Filter based on your use case:
  -- For monitoring: AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)
  -- For management: AND (bn.lifecycle_status IN ('ACTIVE', 'DISABLED') OR bn.lifecycle_status IS NULL)
  -- For history: no filter
```

**Use for:** Camera lists that need to show parent branch lifecycle state

## Migration Checklist

When updating existing queries to be lifecycle-aware:

1. **Identify the query's purpose:**
   - [ ] Is this for operational monitoring?
   - [ ] Is this for management/configuration?
   - [ ] Is this for historical/reporting?

2. **Add the appropriate filter:**
   - For operational: `AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL)`
   - For management: `AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)`
   - For historical: No filter needed

3. **Test the query:**
   - [ ] With an ACTIVE branch
   - [ ] With a DISABLED branch
   - [ ] With an ARCHIVED branch

4. **Update related code:**
   - [ ] Update TypeScript interfaces to include `lifecycleStatus`
   - [ ] Update UI to display lifecycle status badges
   - [ ] Update documentation

## Common Scenarios

### Scenario 1: Calculating Health Metrics

```sql
-- WRONG: Includes disabled/archived branches in health score
SELECT COUNT(*) FROM resource_nodes WHERE node_type = 'branch';

-- CORRECT: Only count active branches
SELECT COUNT(*) 
FROM resource_nodes 
WHERE node_type = 'branch'
  AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL);
```

### Scenario 2: Branch Selection Dropdown

```sql
-- WRONG: Shows archived branches in dropdown
SELECT id, name FROM resource_nodes WHERE node_type = 'branch';

-- BETTER: Shows active and disabled (user might want to reactivate)
SELECT id, name, lifecycle_status
FROM resource_nodes 
WHERE node_type = 'branch'
  AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)
ORDER BY 
  CASE WHEN lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL THEN 0 ELSE 1 END,
  name;
```

### Scenario 3: Incident Report with Branch Context

```sql
-- CORRECT: Historical report includes all lifecycle states
SELECT 
  i.*,
  bn.name as branch_name,
  bn.lifecycle_status as branch_lifecycle_status
FROM incidents i
JOIN cameras c ON c.id = i.camera_id
JOIN resource_nodes bn ON bn.id = c.branch_node_id
WHERE i.tenant_id = $1
  AND i.occurred_at BETWEEN $2 AND $3
  -- No lifecycle filter - need historical accuracy
ORDER BY i.occurred_at DESC;
```

### Scenario 4: Active Alert List

```sql
-- CORRECT: Only show alerts for cameras in active branches
SELECT a.*
FROM analytics_alerts a
JOIN cameras c ON c.id = a.camera_id
JOIN resource_nodes bn ON bn.id = c.branch_node_id
WHERE a.tenant_id = $1
  AND a.status NOT IN ('resolved', 'false_alarm')
  -- Only active branches generate alerts
  AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)
ORDER BY a.created_at DESC;
```

## Database Views

The migration includes helper views for common patterns:

### `active_branches` View

```sql
SELECT * FROM active_branches WHERE tenant_id = $1;
```

Equivalent to:
```sql
SELECT * FROM resource_nodes 
WHERE node_type = 'branch' 
  AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL);
```

### `operational_nodes` View

```sql
SELECT * FROM operational_nodes WHERE tenant_id = $1;
```

Equivalent to:
```sql
SELECT * FROM resource_nodes 
WHERE lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL;
```

## TypeScript Integration

### Repository Methods

```typescript
// Use specific methods for different contexts
const activeBranches = await lifecycleQueries.listActiveBranches(tenantId);
const operationalBranches = await lifecycleQueries.listOperationalBranches(tenantId);
const allBranches = await lifecycleQueries.listAllBranches(tenantId);
```

### API Endpoints

```typescript
// Operational endpoint - active only
app.get('/v1/branches/active', async (req, res) => {
  const branches = await store.listActiveBranches(req.currentUser.tenantId);
  res.json({ data: branches });
});

// Management endpoint - active and disabled
app.get('/v1/branches', async (req, res) => {
  const branches = await store.listOperationalBranches(req.currentUser.tenantId);
  res.json({ data: branches });
});

// Historical endpoint - all states
app.get('/v1/branches/history', async (req, res) => {
  const branches = await store.listAllBranches(req.currentUser.tenantId);
  res.json({ data: branches });
});
```

## Testing

When testing lifecycle-aware queries:

```typescript
describe('Branch lifecycle queries', () => {
  it('operational queries exclude archived branches', async () => {
    // Create branches in different states
    const active = await createBranch({ status: 'ACTIVE' });
    const disabled = await createBranch({ status: 'DISABLED' });
    const archived = await createBranch({ status: 'ARCHIVED' });
    
    // Operational query should include active and disabled
    const operational = await store.listOperationalBranches(tenantId);
    expect(operational.map(b => b.id)).toContain(active.id);
    expect(operational.map(b => b.id)).toContain(disabled.id);
    expect(operational.map(b => b.id)).not.toContain(archived.id);
  });
  
  it('historical queries include all lifecycle states', async () => {
    const archived = await createBranch({ status: 'ARCHIVED' });
    
    const all = await store.listAllBranches(tenantId);
    expect(all.map(b => b.id)).toContain(archived.id);
  });
});
```

## Troubleshooting

### Problem: Health scores dropped after implementing lifecycle

**Cause:** Queries are including disabled/archived branches in metrics

**Solution:** Add `AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL)` to health metric queries

### Problem: Historical reports missing data

**Cause:** Historical queries are filtering out archived branches

**Solution:** Remove lifecycle filters from historical/reporting queries

### Problem: Archived branches appearing in operational views

**Cause:** Missing lifecycle filter in operational queries

**Solution:** Add `AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)` to management queries

## Reference

- Domain types: `src/domain/branch-lifecycle.types.ts`
- Service: `src/services/branch-lifecycle.service.ts`
- API routes: `src/routes/branch-lifecycle.routes.ts`
- Query examples: `src/database/resource-lifecycle-queries.ts`
- Database migration: `database/migrations/007_branch_lifecycle.sql`
