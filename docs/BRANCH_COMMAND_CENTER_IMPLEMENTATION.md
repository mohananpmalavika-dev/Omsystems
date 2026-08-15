# Branch Command Center - Complete Implementation Guide

## Overview

The Branch Command Center is a comprehensive operational workspace for monitoring and managing a single branch's surveillance infrastructure. It provides real-time health monitoring, live camera walls, and detailed drill-down capabilities.

## Architecture

### Backend Services

#### 1. **BranchOperationalSnapshotService**
Location: `backend/src/services/branch-operational-snapshot.service.ts`

**Purpose**: Unified service providing complete operational health snapshots

**Features**:
- Aggregates data from cameras, recorders, storage, network, retention, alerts
- 30-second caching to reduce database load
- Health evaluation with severity scoring
- Normalized, frontend-ready data models

**Key Methods**:
```typescript
getBranchSnapshot(tenantId, branchId, forceRefresh): BranchOperationalSnapshot
getBranchCameras(tenantId, branchId, filter): CameraOperationalStatus[]
getBranchEvents(branchId, options): BranchOperationalEvent[]
recordEvent(event): void
```

#### 2. **API Routes**
Location: `backend/src/routes/branch-command-center.routes.ts`

**Endpoints**:
- `GET /api/v1/branches/:branchId/operational-snapshot` - Complete health snapshot
- `GET /api/v1/branches/:branchId/cameras` - Detailed camera list with filtering
- `GET /api/v1/branches/:branchId/events` - Recent operational events
- `GET /api/v1/branches/:branchId/recorders` - Recorder details
- `GET /api/v1/branches/:branchId/storage` - Storage health
- `GET /api/v1/branches/:branchId/retention` - Retention status
- `GET /api/v1/branches/:branchId/network-health` - Network connectivity
- `GET /api/v1/branches/:branchId/alerts` - Active alerts
- `POST /api/v1/branches/:branchId/refresh` - Force health refresh

### Frontend Components

#### 1. **Main Page**
Location: `dashboard/app/operations/branches/[branchId]/page.tsx`

- Auto-refresh every 30 seconds
- URL state management for deep linking
- Loading and error states

#### 2. **BranchCommandCenter** (Orchestrator)
Location: `dashboard/components/branch-command-center/branch-command-center.tsx`

- Manages component state
- Handles drill-down modals
- Coordinates camera focus mode
- URL state synchronization

#### 3. **BranchHeader**
Location: `dashboard/components/branch-command-center/branch-header.tsx`

- Breadcrumb navigation
- Overall health status badge
- Health score display
- Last telemetry timestamp
- Telemetry freshness warnings
- Refresh button

#### 4. **BranchCriticalReasons**
Location: `dashboard/components/branch-command-center/branch-critical-reasons.tsx`

**"WHY THIS BRANCH IS CRITICAL"** - Immediate problem visibility

- Shows specific reasons for health state
- Severity badges (CRITICAL/WARNING/INFO)
- Component badges (CAMERA/RECORDER/STORAGE/NETWORK/RETENTION)
- Impact descriptions
- Affected resource counts

#### 5. **BranchOperationalSummary**
Location: `dashboard/components/branch-command-center/branch-operational-summary.tsx`

**8 Health Cards**:
1. **Internet** - Connectivity state, edge agent status, latency
2. **Gateway** - Reachability, IP address
3. **Recorder** - Online/offline count
4. **Storage** - Capacity usage, SMART status, failed disks
5. **Cameras** - Online/offline count
6. **Recording** - Active/stopped count
7. **Retention** - Compliance status, minimum days, violations
8. **Alerts** - P1/P2/P3 counts

Cards are clickable to open detailed drill-down modals.

#### 6. **CameraWallToolbar**
Location: `dashboard/components/branch-command-center/camera-wall-toolbar.tsx`

**Controls**:
- **Filter**: All / Live / Offline / Not Recording / Retention Issue / Active Alert
- **Sort**: Camera Number / Health Priority / Recording Problem / Retention Problem / Active Alert
- **Grid**: 2x, 3x, 4x, 6x, 8x columns
- **Stream**: Substream / Mainstream / Auto

#### 7. **EnhancedCameraWall**
Location: `dashboard/components/branch-command-center/enhanced-camera-wall.tsx`

**Camera Tiles with**:
- Operational state badge (LIVE/ONLINE/NO RECORD/STREAM LOSS/OFFLINE)
- Health score (0-100)
- Recording indicator (red REC badge with pulse)
- Issue badges (VIDEO LOSS/TAMPER/FROZEN)
- Retention warning (days remaining)
- Hover details (FPS, latency)
- Click to expand to focus mode

**States**:
- `LIVE` - Online, streaming, recording (green)
- `ONLINE` - Online but not recording (blue)
- `NO_RECORD` - Streaming but recording failed (red)
- `STREAM_LOSS` - Online but no stream (yellow)
- `OFFLINE` - Cannot reach camera (gray)

#### 8. **CameraFocusMode**
Location: `dashboard/components/branch-command-center/camera-focus-mode.tsx`

**Full-screen camera view**:
- Large live video (mainstream quality)
- Camera details panel (recording status, retention, FPS, latency, health score)
- Active issues display
- Action buttons:
  - Playback
  - Timeline
  - Snapshot
  - Export
  - PTZ Control (if supported)

#### 9. **BranchOperationalTimeline**
Location: `dashboard/components/branch-command-center/branch-operational-timeline.tsx`

**Recent events** (last 20):
- Camera status changes
- Recording failures
- HDD warnings
- Network failover
- Alerts created/acknowledged
- Incident creation

**Display**:
- Event type icon
- Severity badge
- Time ago
- Camera name (if applicable)
- Show all / Show less toggle

#### 10. **StorageDrillDown**
Location: `dashboard/components/branch-command-center/storage-drill-down.tsx`

**Detailed storage health**:
- Disk count summary (total/healthy/warning/failed)
- Capacity usage with progress bar
- RAID status
- Critical disks list with SMART metrics:
  - Temperature
  - Reallocated sectors
  - Pending sectors
  - Failure probability
  - Serial number
- Recommendations based on state

#### 11. **RetentionDrillDown**
Location: `dashboard/components/branch-command-center/retention-drill-down.tsx`

**Retention compliance**:
- Compliance breakdown (compliant/warning/violation/unknown)
- Retention statistics (required/minimum/median days)
- Verification confidence
- Affected cameras list with gap analysis
- Per-camera retention days
- Compliance progress bars
- Run verification button

#### 12. **NetworkDrillDown**
Location: `dashboard/components/branch-command-center/network-drill-down.tsx`

**Network connectivity details**:
- Connection quality metrics (latency, packet loss)
- Primary/Secondary WAN status
- Gateway reachability
- VPN tunnel status
- Edge Agent connectivity with version
- Last outage history (start/end/duration)
- Health recommendations
- Run diagnostics button

## Data Flow

```
┌─────────────────────────────────────────────────┐
│  Branch Command Center Page                     │
│  (Auto-refresh every 30s)                      │
└─────────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────┐
│  GET /api/v1/branches/:id/operational-snapshot │
└─────────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────┐
│  BranchOperationalSnapshotService               │
│  - Check 30s cache                              │
│  - Aggregate health data                        │
│  - Evaluate overall state                       │
│  - Return normalized snapshot                   │
└─────────────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ↓                       ↓
┌──────────────────┐   ┌──────────────────┐
│  Health Tables   │   │  Telemetry Data  │
│  - cameras       │   │  - edge_agents   │
│  - recorders     │   │  - network_health│
│  - disk_health   │   │  - ups_health    │
│  - retention     │   │  - alerts        │
└──────────────────┘   └──────────────────┘
```

## Health Evaluation Logic

### Overall State Determination

```typescript
CRITICAL if:
  - All cameras offline
  - >50% cameras not recording
  - Disk failure detected
  - Storage >95% full
  - Retention violation with >50% cameras affected
  - Network completely offline
  - Telemetry >10 minutes old
  - P1 alerts active

WARNING if:
  - Some cameras offline
  - Some cameras not recording
  - Disk SMART warning
  - Storage 75-95% full
  - Retention warning
  - Network degraded/failover
  - Telemetry 2-10 minutes old
  - P2 alerts active

HEALTHY if:
  - All systems operating normally
  - No critical or warning conditions
```

### Health Score Calculation

```typescript
Start with 100 points

Deduct:
  -50: Telemetry outdated (>10 min)
  -30: All cameras offline
  -20: Multiple cameras offline
  -20: >50% cameras not recording
  -25: Disk failed
  -20: Storage >95% full
  -15: Retention violation
  -20: Network offline
  -20: All recorders offline
  -15: P1 alerts (max 15 for multiple)
  -10: Various warning conditions

Final Score: max(0, score)
```

## URL State Management

### Supported URL Parameters

```
/operations/branches/:branchId
  ?camera=<cameraId>        # Open camera in focus mode
  &filter=<filterType>      # Apply camera filter
  &tab=<tabName>            # Open specific tab

Examples:
  /operations/branches/178?camera=cam07
  /operations/branches/178?filter=recording-failure
  /operations/branches/178?camera=cam07&tab=recording
```

## Real-time Updates (Future Enhancement)

### WebSocket/SSE Events

```typescript
interface BranchHealthEvent {
  branchId: string;
  eventType: 
    | 'camera.status.changed'
    | 'recording.status.changed'
    | 'storage.status.changed'
    | 'retention.changed'
    | 'network.status.changed'
    | 'alert.created'
    | 'alert.acknowledged';
  timestamp: Date;
  payload: any;
}
```

**Subscribe on page load**:
```typescript
const ws = new WebSocket(`wss://api.domain.com/ws/branches/${branchId}/health`);

ws.onmessage = (event) => {
  const healthEvent = JSON.parse(event.data);
  // Update UI immediately without polling
  updateBranchSnapshot(healthEvent);
};
```

## Operator Audit Logging (Future Enhancement)

### Audit Events

```typescript
interface OperatorAuditEvent {
  userId: string;
  branchId: string;
  action: 
    | 'VIEW_LIVE'
    | 'VIEW_PLAYBACK'
    | 'EXPORT_VIDEO'
    | 'PTZ_CONTROL'
    | 'ACKNOWLEDGE_ALERT'
    | 'RUN_DIAGNOSTIC';
  resourceId?: string;
  timestamp: Date;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
}
```

**Log all operator actions**:
```typescript
await auditService.log({
  userId: currentUser.id,
  branchId,
  action: 'VIEW_LIVE',
  resourceId: cameraId,
  outcome: 'SUCCESS',
});
```

## Database Schema Requirements

### Branch Health Snapshots Table

```sql
CREATE TABLE branch_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  health_state VARCHAR(20) NOT NULL,
  health_score INTEGER NOT NULL,
  internet_state VARCHAR(20),
  recorder_state VARCHAR(20),
  storage_state VARCHAR(20),
  cameras_total INTEGER,
  cameras_online INTEGER,
  cameras_recording INTEGER,
  required_retention_days INTEGER,
  minimum_retention_days INTEGER,
  retention_violations INTEGER,
  critical_alerts INTEGER,
  warning_alerts INTEGER,
  observed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_branch_health_tenant_branch (tenant_id, branch_id),
  INDEX idx_branch_health_observed (observed_at DESC)
);
```

### Branch Operational Events Table

```sql
CREATE TABLE branch_operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  camera_id UUID,
  camera_name VARCHAR(255),
  recorder_id UUID,
  alert_id UUID,
  occurred_at TIMESTAMP NOT NULL,
  metadata JSONB,
  INDEX idx_branch_events_branch (branch_id, occurred_at DESC),
  INDEX idx_branch_events_severity (branch_id, severity, occurred_at DESC)
);
```

### Operator Audit Log Table

```sql
CREATE TABLE operator_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  outcome VARCHAR(20) NOT NULL,
  source_ip INET,
  user_agent TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB,
  INDEX idx_audit_user (user_id, timestamp DESC),
  INDEX idx_audit_branch (branch_id, timestamp DESC),
  INDEX idx_audit_action (action, timestamp DESC)
);
```

## Integration Points

### 1. Route Registration

Add to main router:
```typescript
import { createBranchCommandCenterRoutes } from './routes/branch-command-center.routes';

app.use('/api/v1/branches', createBranchCommandCenterRoutes(pool));
```

### 2. Navigation Links

Update HO Dashboard to link to Branch Command Center:
```typescript
<Link href={`/operations/branches/${branch.id}`}>
  View Branch Operations
</Link>
```

### 3. LiveViewCapacityManager Integration

```typescript
class LiveViewCapacityManager {
  register(cameraId: string, priority: 'high' | 'low'): void;
  unregister(cameraId: string): void;
  promote(cameraId: string): void; // Upgrade to mainstream
  demote(cameraId: string): void;  // Downgrade to substream
  rebalance(): void;
}

// In camera wall:
capacityManager.register(camera.id, 'low'); // Substream
// In focus mode:
capacityManager.promote(camera.id); // Upgrade to mainstream
```

## Testing Checklist

### Backend
- [ ] Branch snapshot returns correct data structure
- [ ] 30-second caching works correctly
- [ ] Health evaluation logic produces correct states
- [ ] Camera filtering works (all/live/offline/no-record)
- [ ] Event recording stores correctly
- [ ] API endpoints handle missing branches gracefully

### Frontend
- [ ] Page loads and displays all sections
- [ ] Auto-refresh updates data every 30 seconds
- [ ] Health cards show correct states and colors
- [ ] Camera wall displays with correct badges
- [ ] Filtering and sorting work correctly
- [ ] Grid layout changes work (2x to 8x)
- [ ] Camera focus mode opens and displays details
- [ ] Drill-down modals open with correct data
- [ ] Timeline shows recent events
- [ ] URL state persists camera selection
- [ ] Loading and error states display correctly

### Integration
- [ ] Links from HO Dashboard work
- [ ] Navigation breadcrumb works
- [ ] Real-time updates reflect correctly (when implemented)
- [ ] Audit logging captures all actions (when implemented)

## Performance Considerations

1. **Caching**: 30-second cache prevents excessive database queries
2. **Pagination**: Events endpoint supports limit/offset
3. **Selective Loading**: Camera details loaded separately from snapshot
4. **Lazy Modals**: Drill-down modals only render when opened
5. **Optimistic Updates**: UI updates immediately on user actions

## Future Enhancements

### P1 (Next Sprint)
- WebSocket/SSE for real-time health updates
- Operator audit logging
- LiveViewCapacityManager integration
- Automatic camera rotation for large grids

### P2 (Backlog)
- Historical health trends (7-day chart)
- Predictive alerts based on health trends
- Bulk camera actions (restart, verify recording)
- Custom health thresholds per branch
- Export health report (PDF)
- Mobile-responsive layouts
- Digital Twin integration for blast radius visualization

## Success Metrics

1. **Operator Efficiency**: Time to identify and resolve issues
2. **System Visibility**: % of issues detected proactively
3. **Response Time**: Average time from alert to acknowledgment
4. **False Positives**: % of alerts that don't require action
5. **Uptime**: Branch availability percentage
6. **User Satisfaction**: Operator feedback on usability

## Deployment Steps

1. Deploy backend changes:
   ```bash
   npm run build
   npm run migrate
   npm run deploy
   ```

2. Deploy frontend changes:
   ```bash
   cd dashboard
   npm run build
   npm run deploy
   ```

3. Verify endpoints:
   ```bash
   curl https://api.domain.com/api/v1/branches/{branchId}/operational-snapshot
   ```

4. Test in staging environment
5. Monitor error logs and performance
6. Roll out to production gradually (10% → 50% → 100%)

## Support and Troubleshooting

### Common Issues

**Issue**: Snapshot returns stale data
**Solution**: Check cache TTL, force refresh with `?refresh=true`

**Issue**: Camera tiles show "No Stream"
**Solution**: Verify RTSP/HLS endpoints, check network connectivity

**Issue**: Health score doesn't match visual state
**Solution**: Review health evaluation logic, check telemetry freshness

**Issue**: Drill-down modals show no data
**Solution**: Verify child API endpoints return data

## Documentation Links

- [API Documentation](./API_DOCUMENTATION.md)
- [Component Library](./COMPONENT_LIBRARY.md)
- [Health Evaluation Rules](./HEALTH_EVALUATION_RULES.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

## Conclusion

The Branch Command Center provides a complete operational workspace for monitoring and managing branch surveillance infrastructure. It combines real-time health monitoring, intuitive visualizations, and actionable drill-downs to enable operators to quickly identify and resolve issues.

The implementation follows best practices:
- ✅ Single source of truth (BranchOperationalSnapshotService)
- ✅ Normalized data models
- ✅ Performance optimization (caching, pagination)
- ✅ User-centric design (WHY CRITICAL, health-aware sorting)
- ✅ Extensible architecture (easy to add new metrics)
- ✅ Comprehensive error handling

This Branch Command Center transforms branch monitoring from **"show me the cameras"** to **"tell me what's wrong and let me fix it."**
