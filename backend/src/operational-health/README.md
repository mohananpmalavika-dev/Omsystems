# Branch-Centric Operational Health System

## Overview

This is the **canonical operational health system** for surveillance operations. It replaces multiple disparate health calculations with a single source of truth driven by rule-based evaluation.

**Key principle**: Branch is the primary operational entity. Every camera, recorder, HDD, network link, retention violation, edge-agent state, and alert rolls upward into a single branch health object.

## Architecture

```
Camera telemetry ──────┐
Recorder telemetry ────┤
Storage telemetry ─────┤
Recording verification ┤
Retention compliance ──┤
Network telemetry ─────┼──> OperationalHealthService
UPS telemetry ─────────┤      │
Edge Agent heartbeat ──┤      ├─> Health Rule Engine
Alert service ─────────┘      │
                              ▼
                  BranchOperationalHealth
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
          Database Cache  WebSocket Events  API Endpoints
              │               │                │
              └───────────────┴────────────────┘
                              ▼
                     Dashboard & Reports
```

## Core Components

### 1. Types System (`types/`)

**`operational-health.types.ts`**
- `BranchOperationalHealth`: Complete canonical health model
- `BranchMosaicItem`: Lightweight model for 400-branch mosaic
- `OperationalDashboardSummary`: Aggregated enterprise KPIs
- `BranchHealthFilter`: Multi-dimensional filtering
- `HealthState`: `HEALTHY | WARNING | CRITICAL | UNKNOWN`

**Important**: `UNKNOWN ≠ HEALTHY`. Unknown means insufficient evidence.

### 2. Health Rules Engine (`rules/`)

Rule-based evaluation determines branch health. Rules are applied in priority order (highest first).

**Rule Categories:**
- `recorder-health.rule.ts`: Recorder availability
- `camera-health.rule.ts`: Camera availability
- `recording-health.rule.ts`: Recording operational state (separate from camera)
- `storage-health.rule.ts`: HDD and storage health
- `retention-health.rule.ts`: Retention compliance
- `network-health.rule.ts`: Internet connectivity
- `ups-health.rule.ts`: UPS and power backup
- `telemetry-health.rule.ts`: Telemetry freshness
- `alert-health.rule.ts`: Active alert impact

**Key Rules:**

```typescript
// Critical: All recorders offline
allRecordersOfflineRule: priority 100, penalty 50

// Critical: Recording stopped despite cameras online
recordingStoppedRule: priority 95, penalty 45

// Critical: Retention below policy
retentionBelowPolicyRule: priority 85, penalty 35

// Critical: HDD failed
diskFailedRule: priority 90, penalty 40
```

**Rule Evaluation:**
1. All rules evaluated in priority order
2. Most severe state wins (CRITICAL > WARNING > UNKNOWN > HEALTHY)
3. Health score = 100 - sum of penalties (min 0)
4. Reason codes and messages generated for each triggered rule

### 3. Services (`services/`)

**`branch-health-evaluator.service.ts`**
- Core evaluation engine
- Applies all health rules
- Determines overall state and score
- Generates reason codes

**`integrated-operational-health.service.ts`**
- Aggregates component health from existing services
- Computes branch health using evaluator
- Manages cache (30-second TTL)
- Detects state changes
- Records history and emits events

**State Change Detection:**
```typescript
// Triggers history record and event when:
- State changes (HEALTHY → CRITICAL)
- Score changes by ≥5 points
```

### 4. Repository (`repositories/`)

**`branch-health.repository.ts`**

Optimized data access layer with four main operations:

1. **Upsert Current Health**: Fast UPSERT for real-time cache
2. **Get Mosaic Items**: Lightweight query for 400+ branches
3. **Get Dashboard Summary**: Aggregated counts
4. **Record History**: Track state transitions

**Query Optimization:**
- Mosaic returns only display fields (~200 bytes per branch)
- Indexed filtering by state, region, reason codes, retention
- Dashboard summary uses single aggregation query

### 5. Database Schema (`migrations/`)

**`20260815_branch_operational_health_cache.sql`**

Four tables:

1. **`branch_operational_health_current`**: Current state cache
   - One row per branch (UPSERT pattern)
   - All component health summaries
   - Indexed for fast filtering
   - TTL: 30 seconds

2. **`branch_operational_health_history`**: State transitions
   - Every state change recorded
   - Used for availability reports
   - Used for trend analysis

3. **`branch_health_change_events`**: Real-time event queue
   - Published via WebSocket
   - Drives notifications and alerts
   - Consumed by event handlers

4. **`operational_dashboard_summary_cache`**: Dashboard KPI cache
   - Optional fast-path for dashboard load
   - Expires after configured TTL

**Critical Indexes:**
```sql
-- Fast filtering by state
CREATE INDEX idx_branch_health_current_state 
  ON branch_operational_health_current(overall_state, health_score DESC);

-- Retention violations
CREATE INDEX idx_branch_health_current_retention 
  ON branch_operational_health_current(retention_state) 
  WHERE retention_state = 'BELOW_POLICY';

-- Reason code search
CREATE INDEX idx_branch_health_current_reason_codes 
  ON branch_operational_health_current USING GIN(reason_codes);
```

### 6. API Routes (`routes/`)

**`operational-health.routes.ts`**

Production-ready REST API:

```
GET  /api/v1/operational-health/dashboard
     → Dashboard summary KPIs

GET  /api/v1/operational-health/branches?filters
     → Branch health mosaic (lightweight)

GET  /api/v1/operational-health/branches/:id
     → Complete branch health

POST /api/v1/operational-health/branches/:id/refresh
     → Force refresh single branch

POST /api/v1/operational-health/refresh-all
     → Refresh all branches (admin only, background job)

GET  /api/v1/operational-health/branches/:id/history
     → Health state transition history

GET  /api/v1/operational-health/events
     → Recent health change events
```

**Filtering Support:**
- Health states: `?states=CRITICAL,WARNING`
- Internet states: `?internetStates=OFFLINE,DEGRADED`
- Problem filters: `?retentionViolation=true&cameraOffline=true`
- Region filter: `?regionIds=uuid1,uuid2`
- Reason codes: `?reasonCodes=HDD_FAILED,RETENTION_BELOW_POLICY`
- Search: `?search=kochi`

### 7. WebSocket Events (`events/`)

**`health-change-publisher.ts`**

Background service that:
1. Polls `branch_health_change_events` table (1-second interval)
2. Broadcasts events via WebSocket
3. Marks events as published

**Event Types:**
- `CRITICAL_ENTERED`: Branch entered critical state
- `CRITICAL_CLEARED`: Branch recovered from critical
- `WARNING_ENTERED`: Branch entered warning state
- `WARNING_CLEARED`: Branch recovered from warning
- `STATE_CHANGED`: General state transition
- `SCORE_DEGRADED`: Score dropped by >10 points
- `SCORE_IMPROVED`: Score increased by >10 points

## Integration with Existing Services

The integrated service aggregates data from existing tables:

**Camera Health:**
```sql
SELECT COUNT(*) FILTER (WHERE online_status = 'online') as online
FROM cameras WHERE branch_id = $1
```

**Recorder Health:**
```sql
SELECT COUNT(*) FILTER (WHERE status = 'online') as online
FROM recorders WHERE branch_id = $1
```

**Storage Health:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE smart_status = 'failed') as failed,
  SUM(capacity_bytes) as total_capacity
FROM disk_health WHERE branch_id = $1
```

**Retention Health:**
```sql
SELECT retention_days_available, confidence_score
FROM storage_status WHERE branch_id = $1
ORDER BY last_updated DESC LIMIT 1
```

**Network Health:**
```sql
SELECT wan_status, vpn_status
FROM network_health WHERE branch_id = $1
ORDER BY last_updated DESC LIMIT 1
```

**Edge Agent Connectivity:**
```sql
SELECT status, last_heartbeat
FROM edge_agents WHERE branch_id = $1
ORDER BY last_heartbeat DESC LIMIT 1
```

**Alert Summary:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE severity = 'critical') as p1_count
FROM operational_alerts WHERE branch_id = $1 AND status = 'active'
```

## Usage Examples

### 1. Get Dashboard Summary

```typescript
import { IntegratedOperationalHealthService } from './services/integrated-operational-health.service';

const healthService = new IntegratedOperationalHealthService(pool);
const summary = await healthService.getDashboardSummary(tenantId);

// Returns:
// {
//   branches: { total: 400, healthy: 348, warning: 31, critical: 17, unknown: 4 },
//   cameras: { total: 3921, online: 3842, recording: 3785 },
//   retention: { violatingBranches: 23 },
//   ...
// }
```

### 2. Get Branch Mosaic with Filtering

```typescript
const branches = await healthService.getBranchMosaicItems(tenantId, {
  states: ['CRITICAL', 'WARNING'],
  retentionViolation: true,
});

// Returns lightweight mosaic items optimized for display
```

### 3. Get Complete Branch Health

```typescript
const health = await healthService.getBranchHealth(tenantId, branchId);

// Returns complete BranchOperationalHealth with all component details
```

### 4. Refresh Branch Health

```typescript
// Force recomputation from current telemetry
const freshHealth = await healthService.refreshBranchHealth(tenantId, branchId);

// Automatically:
// - Detects state changes
// - Records history
// - Emits WebSocket events
```

### 5. Batch Refresh All Branches

```typescript
const result = await healthService.refreshAllBranchesHealth(tenantId);

// Returns: { processed: 400, updated: 395, errors: 5 }
```

## Health State Semantics

### HEALTHY
Everything required for branch surveillance is operational.

### WARNING
Surveillance continues, but redundancy/capacity/partial coverage is degraded.
Examples:
- 1-2 cameras offline (out of 8+)
- Storage >85% full
- Internet on failover
- UPS on battery

### CRITICAL
Surveillance, evidence acquisition, retention, or connectivity is materially compromised.
Examples:
- All recorders offline
- Recording stopped
- Retention below policy
- HDD failed
- Internet offline
- All cameras offline

### UNKNOWN
Insufficient current evidence to determine health.
Examples:
- Edge agent offline >5 minutes
- No telemetry available
- Retention evidence confidence <30%

**Important**: Never treat `UNKNOWN` as `HEALTHY`. It indicates missing evidence, not health.

## Telemetry Freshness

Branch health includes telemetry freshness indicator:

```typescript
TELEMETRY_THRESHOLDS = {
  CURRENT: 30_000,   // < 30 seconds
  STALE: 120_000,    // 30 sec - 2 min
  OFFLINE: 300_000,  // > 5 min
}
```

**Display:**
- `CURRENT`: Green indicator, data is reliable
- `STALE`: Yellow indicator, data may be outdated
- `OFFLINE`: Gray indicator, no recent telemetry

## Performance Considerations

**Cache-First Strategy:**
1. Check `branch_operational_health_current` (30s TTL)
2. If missing or stale, compute fresh health
3. Update cache and history if changed

**Dashboard Load:**
- Summary query: Single aggregation (instant)
- Mosaic query: Lightweight projection (400 branches in <100ms)
- Detail view: On-demand (only when branch clicked)

**Batch Operations:**
- Process in batches of 10 to avoid overwhelming database
- Background job pattern for refresh-all

**Indexes:**
- State filtering: Instant (indexed)
- Reason code search: GIN index (fast full-text)
- Region filtering: B-tree index (fast lookup)

## Error Handling

**Database Errors:**
```typescript
try {
  await healthService.refreshBranchHealth(tenantId, branchId);
} catch (error) {
  // Log and continue - don't block other branches
  console.error(`Failed to refresh branch ${branchId}:`, error);
}
```

**Missing Data:**
- Handle null/undefined gracefully
- Use `UNKNOWN` state when evidence unavailable
- Set confidence scores appropriately

**Telemetry Gaps:**
- Check `last_telemetry_at` age
- Apply telemetry freshness rules
- Mark branch `OFFLINE` if >5 minutes stale

## Monitoring

**Health Metrics to Monitor:**
- Cache hit rate (should be >95%)
- Average refresh time per branch (<500ms target)
- Event queue depth (should be <100)
- WebSocket connection count
- Failed refresh count

**Alerts:**
- Event queue backing up (>1000 unpublished)
- Refresh failures >5% of branches
- Cache TTL violations (branches not refreshing)

## Future Enhancements

1. **Digital Twin Integration**: Attach branch health to Digital Twin nodes
2. **Predictive Health**: ML-based failure prediction
3. **SLA Tracking**: Automatic SLA compliance monitoring
4. **Automated Remediation**: Trigger recovery workflows on state changes
5. **Custom Rules**: Per-tenant health rule configuration
6. **Health Trends**: Time-series analysis and forecasting

## Migration Guide

### From Old System

**Old Approach:**
```typescript
// Multiple queries, inconsistent logic
const cameras = await getCameraStatus(branchId);
const storage = await getStorageStatus(branchId);
// ... manual health determination in UI
```

**New Approach:**
```typescript
// Single canonical source
const health = await healthService.getBranchHealth(tenantId, branchId);
// health.overallState, health.reasons, etc.
```

### Database Migration

```sql
-- Run migration
\i backend/prisma/migrations/20260815_branch_operational_health_cache.sql

-- Initial population (background job)
SELECT refresh_all_branches();
```

### Frontend Migration

Replace dashboard components with new operational health components:

```typescript
// Old
import { BranchDashboard } from './old-dashboard';

// New
import { OperationalDashboard } from './operational-health/operational-dashboard';
```

## Support

For questions or issues:
1. Check this README
2. Review health rule definitions in `rules/`
3. Examine database schema in `migrations/`
4. Check API documentation in `routes/`

## License

Internal use only - Omsystems Surveillance Platform
