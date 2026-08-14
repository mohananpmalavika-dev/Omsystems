# Edge Agent & Camera Reconnection Feature

## Overview

This feature provides a comprehensive solution for bringing offline Edge Agents and their connected cameras back online through the dashboard UI. It includes both individual and bulk reconnection capabilities with real-time status updates and detailed audit logging.

## Architecture

### Backend Components

#### 1. API Endpoints (`backend/src/routes/operational-health.routes.ts`)

Three new REST endpoints for reconnection operations:

- **POST** `/v1/operations/health/edge-agents/:id/reconnect`
  - Initiates Edge Agent reconnection
  - Optional parameter: `reconnectCameras` (boolean, default: true)
  - Returns: Command ID, status, affected cameras count

- **POST** `/v1/operations/health/cameras/bulk-online`
  - Brings multiple cameras online simultaneously
  - Supports filtering by: `cameraIds`, `branchId`, or `edgeAgentId`
  - Returns: Affected camera count, command IDs, status

- **POST** `/v1/operations/health/cameras/:id/reconnect`
  - Reconnects a single offline camera
  - Returns: Command ID, camera details, status

#### 2. Service Layer (`backend/src/services/operational-health.service.ts`)

**reconnectEdgeAgent()**
- Creates reconnection command for Edge Agent
- Updates agent status with reconnection attempt metadata
- Optionally triggers camera recovery for all branch cameras
- Logs audit trail with user, timestamp, and command details
- Uses database transactions for atomicity

**bringCamerasOnline()**
- Bulk camera recovery operation
- Supports multiple filter types (IDs, branch, agent)
- Creates individual recovery commands per camera
- Updates camera status to 'pending' recovery
- Comprehensive audit logging

**reconnectCamera()**
- Single camera recovery
- Validates camera access permissions
- Creates recovery command
- Updates camera recovery status

### Frontend Components

#### 1. Edge Agent Card (`dashboard/components/operational-health/edge-agent-card.tsx`)

Enhanced with reconnection UI:
- Visual status indicators (online/offline/warning)
- Resource usage displays (CPU, memory, disk)
- **Reconnect Agent** button (offline agents only)
- **Reconnect Agent + Cameras** button for full recovery
- Real-time status messages and error handling
- Success feedback with auto-dismiss

#### 2. Branch Gateway Fleet (`dashboard/components/branch-gateway-fleet.tsx`)

Modified gateway rows to include:
- Inline reconnection buttons for offline gateways
- Two-action approach: gateway-only or gateway+cameras
- Visual feedback during reconnection
- Error message display

#### 3. Reconnect Cameras Modal (`dashboard/components/operational-health/reconnect-cameras-modal.tsx`)

Dedicated modal for bulk camera operations:
- Confirmation dialog with affected camera count
- Progress indicator during operation
- Success/error state display
- Auto-close after successful reconnection

#### 4. Offline Cameras Panel (`dashboard/components/operational-health/offline-cameras-panel.tsx`)

Comprehensive camera management:
- Lists all offline cameras with details
- Individual camera reconnect buttons
- Checkbox selection for bulk operations
- "Select All" functionality
- Real-time status updates
- Recovery progress indicators

#### 5. Branch Recovery Dashboard (`dashboard/components/operational-health/branch-recovery-dashboard.tsx`)

Unified recovery interface:
- Summary statistics (total/online/offline agents and cameras)
- Separate sections for offline and online agents
- Integrated offline cameras panel
- Auto-refresh capability
- Comprehensive error handling

### Type Definitions

#### EdgeAgentHealth Interface
```typescript
{
  // ... existing fields
  reconnectionAttemptedAt?: string | null;
  reconnectionAttemptedBy?: string | null;
  reconnectionStatus?: 'pending' | 'in_progress' | 'success' | 'failed' | null;
}
```

#### CameraHealth Interface
```typescript
{
  // ... existing fields
  recoveryAttemptedAt?: string | null;
  recoveryStatus?: 'pending' | 'in_progress' | 'success' | 'failed' | null;
  recoveryInitiatedBy?: string | null;
}
```

## Usage Examples

### 1. Reconnect an Offline Edge Agent (Agent Only)

```typescript
import { reconnectEdgeAgent } from '@/lib/api/operational-health';

// Reconnect just the agent
const result = await reconnectEdgeAgent(agentId, false);
console.log(result.message); // "Reconnection command sent..."
```

### 2. Reconnect Edge Agent with All Cameras

```typescript
import { reconnectEdgeAgent } from '@/lib/api/operational-health';

// Reconnect agent and restore all cameras
const result = await reconnectEdgeAgent(agentId, true);
console.log(`${result.camerasAffected} cameras will be recovered`);
```

### 3. Bulk Camera Recovery by Branch

```typescript
import { bringCamerasOnline } from '@/lib/api/operational-health';

// Bring all offline cameras online for a branch
const result = await bringCamerasOnline({ branchId: 'branch-123' });
console.log(`Recovery initiated for ${result.camerasAffected} cameras`);
```

### 4. Bulk Camera Recovery by Edge Agent

```typescript
import { bringCamerasOnline } from '@/lib/api/operational-health';

// Bring online all cameras connected to an edge agent
const result = await bringCamerasOnline({ edgeAgentId: 'agent-456' });
```

### 5. Reconnect Specific Cameras

```typescript
import { bringCamerasOnline } from '@/lib/api/operational-health';

// Reconnect specific camera IDs
const result = await bringCamerasOnline({ 
  cameraIds: ['cam-1', 'cam-2', 'cam-3'] 
});
```

### 6. Single Camera Reconnection

```typescript
import { reconnectCamera } from '@/lib/api/operational-health';

const result = await reconnectCamera('camera-789');
console.log(result.message); // "Recovery command sent for camera..."
```

## UI Integration

### Using the Branch Recovery Dashboard

```tsx
import { BranchRecoveryDashboard } from '@/components/operational-health/branch-recovery-dashboard';

function BranchPage({ branchId, branchName }) {
  return (
    <BranchRecoveryDashboard
      branchId={branchId}
      branchName={branchName}
    />
  );
}
```

### Using the Offline Cameras Panel

```tsx
import { OfflineCamerasPanel } from '@/components/operational-health/offline-cameras-panel';

function CameraMonitoring({ branchId }) {
  return (
    <OfflineCamerasPanel
      branchId={branchId}
      autoRefresh={true}
      refreshInterval={30000}
    />
  );
}
```

### Using the Reconnect Modal

```tsx
import { ReconnectCamerasModal } from '@/components/operational-health/reconnect-cameras-modal';

function CameraControls({ branchId, offlineCount }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Reconnect Cameras ({offlineCount})
      </button>
      
      <ReconnectCamerasModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        branchId={branchId}
        offlineCameraCount={offlineCount}
        onSuccess={() => {
          console.log('Cameras reconnected');
          setShowModal(false);
        }}
      />
    </>
  );
}
```

## Database Schema Requirements

### Edge Agents Table
```sql
ALTER TABLE edge_agents ADD COLUMN IF NOT EXISTS reconnection_attempted_at TIMESTAMP;
ALTER TABLE edge_agents ADD COLUMN IF NOT EXISTS reconnection_attempted_by TEXT;
ALTER TABLE edge_agents ADD COLUMN IF NOT EXISTS reconnection_status TEXT;
```

### Cameras Table
```sql
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS recovery_attempted_at TIMESTAMP;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS recovery_status TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS recovery_initiated_by TEXT;
```

### Edge Commands Table (if not exists)
```sql
CREATE TABLE IF NOT EXISTS edge_commands (
  id TEXT PRIMARY KEY,
  edge_agent_id TEXT NOT NULL REFERENCES edge_agents(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  command_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  payload JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP,
  error TEXT
);
```

### Camera Commands Table (if not exists)
```sql
CREATE TABLE IF NOT EXISTS camera_commands (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  command_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  payload JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP,
  error TEXT
);
```

## Security & Permissions

All reconnection operations require:
1. Valid authenticated session
2. `device:configure` permission for the branch
3. Tenant-scoped access (operations are isolated to user's tenant)

Audit logging captures:
- User ID who initiated the action
- Timestamp of the operation
- Command IDs and affected resources
- Operation outcome (pending/success/failure)

## Error Handling

### Backend Errors
- `404` - Edge Agent or Camera not found
- `401` - Unauthorized (no valid session)
- `403` - Forbidden (insufficient permissions)
- `500` - Server error (with detailed message)

### Frontend Error Display
- Inline error messages in components
- Toast notifications for critical failures
- Retry capability with exponential backoff
- User-friendly error descriptions

## Monitoring & Observability

### Audit Trail
Every reconnection attempt is logged in the audit table with:
- Action: `edge_agent.reconnection_initiated` or `camera.reconnection_initiated`
- Resource: Branch ID
- Actor: User ID
- Details: Command IDs, camera counts, filters used

### Status Tracking
- `reconnectionStatus` on Edge Agents
- `recoveryStatus` on Cameras
- Possible values: `pending`, `in_progress`, `success`, `failed`

### Metrics to Monitor
- Reconnection success rate
- Average time to recovery
- Most frequently offline agents/cameras
- Command completion rate

## Best Practices

1. **Always use batch operations** when reconnecting multiple cameras
2. **Provide user feedback** during long-running operations
3. **Auto-refresh status** after reconnection attempts
4. **Log all operations** for troubleshooting
5. **Handle network failures** gracefully with retries
6. **Clear user expectations** about recovery time

## Troubleshooting

### Edge Agent Won't Reconnect
1. Check network connectivity at branch
2. Verify Edge Agent service is running
3. Review Edge Agent logs for errors
4. Check firewall/tunnel configuration
5. Validate credentials haven't been revoked

### Cameras Remain Offline After Recovery
1. Verify Edge Agent is online first
2. Check camera power and network connectivity
3. Validate RTSP credentials are correct
4. Review camera-specific error logs
5. Try individual camera reconnection

### Bulk Operations Timeout
1. Reduce batch size
2. Implement pagination for large camera sets
3. Check database connection pool limits
4. Review network latency to cameras

## Future Enhancements

1. **Scheduled Reconnection**: Auto-retry at configurable intervals
2. **Smart Recovery**: ML-based prediction of recovery success
3. **Batch Prioritization**: Reconnect critical cameras first
4. **Webhook Notifications**: Alert on recovery completion
5. **Recovery Analytics**: Dashboard showing recovery patterns
6. **Health Checks**: Pre-reconnection validation
7. **Progressive Rollout**: Staged camera recovery to prevent overload

## API Response Examples

### Successful Edge Agent Reconnection
```json
{
  "success": true,
  "message": "Edge Agent reconnection initiated",
  "data": {
    "edgeAgentId": "agent-abc123",
    "commandId": "cmd-xyz789",
    "status": "pending",
    "branchId": "branch-456",
    "branchName": "Main Office",
    "reconnectCameras": true,
    "camerasAffected": 12,
    "message": "Reconnection command sent to Edge Agent. 12 cameras will be recovered."
  }
}
```

### Successful Bulk Camera Recovery
```json
{
  "success": true,
  "message": "Camera reconnection initiated",
  "data": {
    "camerasAffected": 8,
    "cameraIds": ["cam-1", "cam-2", "cam-3", ...],
    "commandIds": ["cmd-a", "cmd-b", "cmd-c", ...],
    "status": "pending",
    "message": "Recovery initiated for 8 camera(s)"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Edge Agent not found or access denied"
}
```
