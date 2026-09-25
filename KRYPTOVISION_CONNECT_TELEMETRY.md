# KryptoVision Connect - Telemetry & Audit Integration

## Overview

KryptoVision Connect integrates with the existing VMS observability infrastructure to provide comprehensive telemetry and audit logging for the communication subsystem.

---

## Prometheus Metrics

All communication metrics are exposed through the existing `/metrics` endpoint in Prometheus text format.

### Device & Presence Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `comm_devices_online` | Gauge | tenant_id, branch_id | Number of online communication devices |
| `comm_devices_total` | Gauge | tenant_id, branch_id, status | Total registered devices |
| `comm_branches_online` | Gauge | tenant_id, branch_id | Branches with at least one online device |
| `comm_employees_online` | Gauge | tenant_id, employee_id | Employees with at least one online device |

### Call Session Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `comm_calls_started_total` | Counter | tenant_id, direction, source_type, target_type, branch_id | Total calls initiated |
| `comm_calls_connected_total` | Counter | tenant_id, branch_id | Total calls successfully connected |
| `comm_calls_failed_total` | Counter | tenant_id, branch_id, end_reason | Total failed calls |
| `comm_calls_missed_total` | Counter | tenant_id, branch_id, end_reason | Total missed calls |
| `comm_calls_rejected_total` | Counter | tenant_id, branch_id, end_reason | Total rejected calls |
| `comm_calls_cancelled_total` | Counter | tenant_id, branch_id, end_reason | Total cancelled calls |
| `comm_calls_active` | Gauge | tenant_id | Currently active call sessions |
| `comm_call_duration_seconds` | Histogram | tenant_id | Call duration distribution |
| `comm_call_setup_time_ms` | Histogram | tenant_id | Time from initiation to connection |

### Messaging Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `comm_messages_sent_total` | Counter | tenant_id, message_type, conversation_type, branch_id | Total messages sent |
| `comm_messages_delivered_total` | Counter | tenant_id, message_type | Total messages delivered |
| `comm_messages_read_total` | Counter | tenant_id, message_type | Total messages read |
| `comm_message_delivery_latency_ms` | Histogram | tenant_id | Message delivery time |
| `comm_conversations_active` | Gauge | tenant_id, conversation_type | Active conversations |

### Call Quality Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `comm_call_quality_status` | Gauge | tenant_id, call_id | Call quality (1=GOOD, 2=DEGRADED, 3=POOR) |
| `comm_call_rtt_ms` | Histogram | tenant_id | WebRTC round-trip time |
| `comm_call_jitter_ms` | Histogram | tenant_id | WebRTC jitter |
| `comm_call_packet_loss_pct` | Histogram | tenant_id | WebRTC packet loss percentage |

### Device Enrollment Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `comm_enrollment_codes_generated_total` | Counter | tenant_id, branch_id | Enrollment codes generated |
| `comm_enrollment_codes_used_total` | Counter | tenant_id, branch_id | Enrollment codes used |
| `comm_enrollment_codes_expired_total` | Counter | tenant_id, branch_id | Enrollment codes expired |
| `comm_devices_enrolled_total` | Counter | tenant_id, platform, device_type | Devices enrolled |
| `comm_devices_revoked_total` | Counter | tenant_id, revocation_reason | Devices revoked |

---

## Histogram Buckets

### Call Duration (`comm_call_duration_seconds`)
```
[5, 10, 30, 60, 120, 300, 600, 1800, 3600]
```
Ranges from 5 seconds to 1 hour, optimized for typical VMS operator calls.

### Call Setup Time (`comm_call_setup_time_ms`)
```
[100, 250, 500, 1000, 2000, 3000, 5000, 10000]
```
Ranges from 100ms to 10s, tracking WebRTC connection establishment.

### Message Delivery Latency (`comm_message_delivery_latency_ms`)
```
[10, 50, 100, 250, 500, 1000, 2000, 5000, 10000]
```
Ranges from 10ms to 10s, tracking offline/online delivery performance.

### WebRTC RTT (`comm_call_rtt_ms`)
```
[10, 25, 50, 100, 150, 200, 300, 500, 1000]
```
Based on ITU-T G.114 thresholds:
- < 150ms: GOOD
- 150-300ms: DEGRADED
- > 300ms: POOR

### WebRTC Jitter (`comm_call_jitter_ms`)
```
[5, 10, 20, 30, 50, 75, 100, 150, 200]
```

### WebRTC Packet Loss (`comm_call_packet_loss_pct`)
```
[0.1, 0.5, 1, 2, 3, 5, 10, 15, 20]
```
Values are percentages (0-100).

---

## API Endpoints

### Prometheus Metrics
```http
GET /metrics
```
**Response:**
```
# HELP comm_devices_online Number of communication devices currently online by tenant and branch
# TYPE comm_devices_online gauge
comm_devices_online{tenant_id="tenant-1",branch_id="branch-1"} 5
comm_devices_online{tenant_id="tenant-1",branch_id="branch-2"} 3

# HELP comm_calls_started_total Total number of call sessions initiated by direction and target type
# TYPE comm_calls_started_total counter
comm_calls_started_total{tenant_id="tenant-1",direction="INBOUND",source_type="DEVICE",target_type="SOC_QUEUE"} 142
```

### Communication Telemetry Summary
```http
GET /api/vms/observability/communications/summary
```
**Response:**
```json
{
  "success": true,
  "data": {
    "devices": {
      "online": 8,
      "total": 25
    },
    "branches": {
      "online": 3
    },
    "employees": {
      "online": 5
    },
    "calls": {
      "active": 2,
      "started": 156,
      "connected": 142,
      "failed": 8,
      "missed": 4,
      "rejected": 2,
      "cancelled": 0
    },
    "messages": {
      "sent": 487,
      "delivered": 485,
      "read": 421
    },
    "enrollment": {
      "codesGenerated": 30,
      "codesUsed": 25,
      "codesExpired": 2,
      "devicesEnrolled": 25,
      "devicesRevoked": 3
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Audit Events

All audit events are written to the `central_audit_ledger` table via `ControlPlaneStore.writeAudit()`.

### Device Enrollment Events

#### COMM_ENROLLMENT_CODE_CREATED
```json
{
  "action": "COMM_ENROLLMENT_CODE_CREATED",
  "tenantId": "...",
  "actorUserId": "admin-user-id",
  "resourceNodeId": "branch-id",
  "outcome": "success",
  "sourceIp": "10.0.1.100",
  "details": {
    "enrollmentCodeId": "...",
    "branchId": "...",
    "allowedDeviceType": "BRANCH_SHARED",
    "expiresAt": "2024-01-15T12:00:00.000Z",
    "maxUses": 1
  }
}
```

#### COMM_DEVICE_ENROLLED
```json
{
  "action": "COMM_DEVICE_ENROLLED",
  "tenantId": "...",
  "actorUserId": null,
  "resourceNodeId": "branch-id",
  "outcome": "success",
  "sourceIp": "192.168.1.50",
  "details": {
    "deviceId": "...",
    "deviceUuid": "...",
    "deviceName": "Reception PC",
    "deviceType": "BRANCH_SHARED",
    "platform": "WINDOWS",
    "branchId": "...",
    "enrollmentCodeId": "...",
    "linkedEmployeeIds": ["emp-1", "emp-2"]
  }
}
```

#### COMM_DEVICE_APPROVED
```json
{
  "action": "COMM_DEVICE_APPROVED",
  "tenantId": "...",
  "actorUserId": "admin-user-id",
  "resourceNodeId": "branch-id",
  "outcome": "success",
  "details": {
    "deviceId": "...",
    "deviceName": "Reception PC",
    "branchId": "...",
    "approvedBy": "admin-user-id"
  }
}
```

#### COMM_DEVICE_REVOKED
```json
{
  "action": "COMM_DEVICE_REVOKED",
  "tenantId": "...",
  "actorUserId": "admin-user-id",
  "resourceNodeId": null,
  "outcome": "success",
  "details": {
    "deviceId": "...",
    "deviceName": "Lost Mobile",
    "reason": "Device lost or stolen",
    "revokedBy": "admin-user-id"
  }
}
```

#### COMM_DEVICE_EMPLOYEE_LINKED / UNLINKED
```json
{
  "action": "COMM_DEVICE_EMPLOYEE_LINKED",
  "tenantId": "...",
  "actorUserId": "admin-user-id",
  "resourceNodeId": null,
  "outcome": "success",
  "details": {
    "deviceId": "...",
    "employeeId": "...",
    "isPrimary": true,
    "permissions": {
      "canReceiveCalls": true,
      "canMakeCalls": true,
      "canReceiveMessages": true,
      "canSendMessages": true
    }
  }
}
```

### Call Events

#### COMM_CALL_STARTED
```json
{
  "action": "COMM_CALL_STARTED",
  "tenantId": "...",
  "actorUserId": "operator-user-id",
  "resourceNodeId": "branch-id",
  "outcome": "success",
  "sourceIp": "10.0.1.100",
  "details": {
    "callId": "...",
    "direction": "OUTBOUND",
    "sourceType": "OPERATOR",
    "sourceId": "operator-user-id",
    "targetType": "BRANCH",
    "targetId": "branch-id",
    "branchId": "branch-id",
    "context": {
      "incidentId": "incident-123",
      "priority": "HIGH"
    }
  }
}
```

#### COMM_CALL_ACCEPTED
```json
{
  "action": "COMM_CALL_ACCEPTED",
  "tenantId": "...",
  "actorUserId": null,
  "resourceNodeId": null,
  "outcome": "success",
  "sourceIp": "192.168.1.50",
  "details": {
    "callId": "...",
    "acceptedBy": "device-id",
    "acceptedByType": "DEVICE",
    "deviceId": "device-id",
    "setupTimeMs": 1250
  }
}
```

#### COMM_CALL_ENDED
```json
{
  "action": "COMM_CALL_ENDED",
  "tenantId": "...",
  "actorUserId": "operator-user-id",
  "resourceNodeId": null,
  "outcome": "success",
  "details": {
    "callId": "...",
    "status": "ENDED",
    "durationSeconds": 180,
    "endReason": "NORMAL_HANGUP",
    "initiatedBy": "operator-user-id"
  }
}
```

#### COMM_CALL_FAILED / MISSED / REJECTED / CANCELLED
Similar structure to ENDED, with different `action` and `status` values.

### Messaging Events

#### COMM_MESSAGE_SENT
```json
{
  "action": "COMM_MESSAGE_SENT",
  "tenantId": "...",
  "actorUserId": "operator-user-id",
  "resourceNodeId": "branch-id",
  "outcome": "success",
  "details": {
    "messageId": "...",
    "conversationId": "...",
    "conversationType": "BRANCH_SOC",
    "messageType": "TEXT",
    "targetBranchId": "branch-id",
    "bodyLength": 45
  }
}
```
**Note:** Message body content is NEVER logged for privacy.

#### COMM_MESSAGE_DELIVERED
```json
{
  "action": "COMM_MESSAGE_DELIVERED",
  "tenantId": "...",
  "actorUserId": null,
  "resourceNodeId": null,
  "outcome": "success",
  "details": {
    "messageId": "...",
    "conversationId": "...",
    "deliveredTo": "device-id",
    "deliveryLatencyMs": 125
  }
}
```

#### COMM_MESSAGE_READ
```json
{
  "action": "COMM_MESSAGE_READ",
  "tenantId": "...",
  "actorUserId": null,
  "resourceNodeId": null,
  "outcome": "success",
  "details": {
    "messageId": "...",
    "conversationId": "...",
    "readBy": "device-id"
  }
}
```

---

## Usage Examples

### Service Integration

```typescript
import { CommunicationTelemetryService } from './communications/services/communication-telemetry.service.js';
import { CommunicationAuditService } from './communications/services/communication-audit.service.js';

// Initialize services
const telemetry = new CommunicationTelemetryService(logger);
const audit = new CommunicationAuditService(store, logger);

// Record call started
telemetry.recordCallStarted({
  tenantId: 'tenant-1',
  callId: 'call-123',
  direction: 'OUTBOUND',
  sourceType: 'OPERATOR',
  targetType: 'BRANCH',
  branchId: 'branch-1',
});

await audit.recordCallStarted(
  'tenant-1',
  'operator-user-id',
  {
    callId: 'call-123',
    direction: 'OUTBOUND',
    sourceType: 'OPERATOR',
    sourceId: 'operator-user-id',
    targetType: 'BRANCH',
    targetId: 'branch-1',
    branchId: 'branch-1',
  },
  request.ip
);

// Record call quality
telemetry.recordCallQuality({
  tenantId: 'tenant-1',
  callId: 'call-123',
  quality: 'GOOD',
  rttMs: 45,
  jitterMs: 8,
  packetLossPct: 0.2,
});

// Record message sent
telemetry.recordMessageSent({
  tenantId: 'tenant-1',
  messageType: 'TEXT',
  conversationType: 'BRANCH_SOC',
  branchId: 'branch-1',
});

await audit.recordMessageSent(
  'tenant-1',
  'operator-user-id',
  {
    messageId: 'msg-456',
    conversationId: 'conv-789',
    conversationType: 'BRANCH_SOC',
    messageType: 'TEXT',
    targetBranchId: 'branch-1',
    bodyLength: 45,
  },
  request.ip
);
```

---

## Grafana Dashboard Queries

### Active Calls by Tenant
```promql
comm_calls_active{tenant_id="tenant-1"}
```

### Call Success Rate (last hour)
```promql
rate(comm_calls_connected_total{tenant_id="tenant-1"}[1h]) / 
rate(comm_calls_started_total{tenant_id="tenant-1"}[1h])
```

### P95 Call Setup Time
```promql
histogram_quantile(0.95, 
  rate(comm_call_setup_time_ms_bucket{tenant_id="tenant-1"}[5m])
)
```

### P50 WebRTC RTT
```promql
histogram_quantile(0.50, 
  rate(comm_call_rtt_ms_bucket{tenant_id="tenant-1"}[5m])
)
```

### Message Delivery Rate
```promql
rate(comm_messages_delivered_total{tenant_id="tenant-1"}[1h]) / 
rate(comm_messages_sent_total{tenant_id="tenant-1"}[1h])
```

### Devices Online by Branch
```promql
comm_devices_online{tenant_id="tenant-1"}
```

---

## Alerting Rules

### High Call Failure Rate
```yaml
- alert: HighCommCallFailureRate
  expr: |
    rate(comm_calls_failed_total[5m]) / 
    rate(comm_calls_started_total[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High call failure rate detected"
    description: "{{ $labels.tenant_id }} has {{ $value | humanizePercentage }} call failure rate"
```

### Poor Call Quality
```yaml
- alert: PoorCommCallQuality
  expr: comm_call_quality_status{} >= 3
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Poor call quality detected"
    description: "Call {{ $labels.call_id }} has POOR quality status"
```

### High Message Delivery Latency
```yaml
- alert: HighCommMessageLatency
  expr: |
    histogram_quantile(0.95, 
      rate(comm_message_delivery_latency_ms_bucket[5m])
    ) > 5000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High message delivery latency"
    description: "P95 message delivery latency is {{ $value }}ms"
```

### Device Offline
```yaml
- alert: CommDeviceOffline
  expr: comm_devices_online{branch_id="critical-branch"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "All communication devices offline"
    description: "Branch {{ $labels.branch_id }} has no online devices"
```

---

## Privacy & Compliance

### What is Logged
- Device IDs, names, types, platforms
- Call session metadata (IDs, durations, participants, status)
- Message metadata (IDs, types, lengths, timestamps)
- Enrollment codes and events
- User/employee/operator IDs
- Branch IDs
- Timestamps and IP addresses

### What is NOT Logged
- ❌ Message body content
- ❌ Audio/media content
- ❌ Device private keys
- ❌ Enrollment secrets
- ❌ WebRTC session secrets
- ❌ Refresh tokens

### Retention
- **Prometheus metrics:** Depends on Prometheus retention policy (typically 15-30 days)
- **Audit events:** Stored in `central_audit_ledger` with hash chain integrity (indefinite retention)

### Access Control
- Metrics endpoint (`/metrics`): No authentication required (suitable for Prometheus scraping)
- Audit events: Database-level access control via existing VMS permissions
- Telemetry summary endpoint: Requires VMS authentication

---

## Testing

### Verify Metrics Exposure
```bash
curl http://localhost:8080/metrics | grep comm_
```

### Verify Telemetry Summary
```bash
curl http://localhost:8080/api/vms/observability/communications/summary
```

### Verify Audit Events
```sql
SELECT 
  action, 
  actor_user_id, 
  resource_node_id, 
  details, 
  created_at
FROM central_audit_ledger
WHERE action LIKE 'COMM_%'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Integration Checklist

- [x] Prometheus metrics registry created
- [x] Metrics integrated into existing `/metrics` endpoint
- [x] Audit event types defined
- [x] Audit service created with type-safe builders
- [x] Telemetry summary endpoint added
- [x] Privacy-safe logging (no message content)
- [x] Histogram buckets optimized for VMS use case
- [x] Documentation complete
- [ ] Grafana dashboard created
- [ ] Alerting rules deployed
- [ ] Integration tests written
