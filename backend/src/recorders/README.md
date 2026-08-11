# Recorder Integration Framework

Complete evidence-based recorder acquisition and assessment subsystem.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│  (RecordingComplianceService, Health Dashboard, Reports)    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              RecorderEvidenceEvaluator                       │
│              (Policy & Assessment)                           │
│  • Evaluates evidence freshness                             │
│  • Detects conflicts                                        │
│  • Calculates operational status                            │
│  • NEVER acquires evidence                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│            RecorderEvidenceService                           │
│            (Orchestration)                                   │
│  • Coordinates adapter operations                           │
│  • Manages collection cycles                                │
│  • Applies concurrency limits                               │
│  • Handles timeouts                                         │
└────────────┬───────────────────────────┬────────────────────┘
             │                           │
             │                      ┌────▼─────┐
             │                      │ Evidence │
             │                      │Repository│
             │                      └──────────┘
┌────────────▼────────────────────────────────────────────────┐
│                  Adapter Layer                               │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐                 │
│  │  ONVIF   │  │ Hikvision │  │  Dahua   │                 │
│  │ Adapter  │  │  Adapter  │  │ Adapter  │                 │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘                 │
│       │              │              │                        │
│  ┌────▼──────────────▼──────────────▼─────┐                 │
│  │      Common Transport Layer            │                 │
│  │  • HTTP with retry/timeout             │                 │
│  │  • Authentication providers            │                 │
│  │  • Error normalization                 │                 │
│  │  • Concurrency control                 │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Recorder Device                           │
│  (ONVIF/ISAPI/Vendor APIs)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Critical Principles

### 1. Evidence vs Assessment

**Evidence** = Observed facts  
**Assessment** = Policy interpretation of facts

```typescript
// ❌ WRONG: Adapter invents health status
async getRecorderHealth() {
  return { healthy: true }; // Invented!
}

// ✅ CORRECT: Adapter returns evidence
async getRecordingStatus() {
  return observed(
    { recording: true, lastRecordingAt: new Date() },
    source,
    { latencyMs: 245 }
  );
}

// ✅ CORRECT: Evaluator interprets evidence
evaluateRecordingCompliance(evidence) {
  if (evidence.recording.state !== 'OBSERVED') {
    return 'UNKNOWN';
  }
  
  const age = Date.now() - evidence.lastRecordingAt.value.getTime();
  if (age > MAX_GAP) {
    return 'NON_COMPLIANT';
  }
  
  return 'COMPLIANT';
}
```

### 2. Unknown ≠ False

```typescript
// ❌ WRONG: Converting unknown to false
if (!evidence.recording.value) {
  return { compliant: false };
}

// ✅ CORRECT: Distinguishing states
if (evidence.recording.state !== 'OBSERVED') {
  return { status: 'UNKNOWN', reason: 'INSUFFICIENT_EVIDENCE' };
}

if (evidence.recording.value === false) {
  return { status: 'NON_COMPLIANT', reason: 'RECORDING_STOPPED' };
}
```

### 3. Evidence States

All observations use `EvidenceValue<T>`:

```typescript
interface EvidenceValue<T> {
  state: EvidenceState;  // OBSERVED, UNKNOWN, UNSUPPORTED, etc.
  value?: T;             // Only present when state=OBSERVED
  observedAt: Date;      // When observation occurred
  source: EvidenceSource; // Where evidence came from
  confidence: number;    // 0-1 reliability score
  latencyMs?: number;    // Observation latency
  error?: EvidenceError; // Error details (when state != OBSERVED)
}
```

States:
- `OBSERVED` - Value successfully retrieved
- `UNKNOWN` - Observation failed (unspecified reason)
- `UNSUPPORTED` - Device/adapter doesn't implement capability
- `AUTH_FAILED` - Authentication prevented observation
- `TIMEOUT` - Operation timed out
- `UNREACHABLE` - Device/network unreachable
- `MALFORMED_RESPONSE` - Response unparseable
- `RATE_LIMITED` - Temporarily throttled
- `DEVICE_ERROR` - Recorder internal error

## Module Structure

```
backend/src/recorders/
├── contracts/              # Evidence model contracts
│   ├── evidence-value.ts     # Core evidence type system
│   ├── recorder-evidence.ts  # Evidence structures
│   ├── evidence-helpers.ts   # Factory functions
│   └── index.ts
│
├── transport/              # Common transport layer
│   ├── recorder-http-transport.ts  # HTTP with retry/timeout
│   ├── recorder-auth.ts            # Auth providers
│   ├── error-mapper.ts             # Error normalization
│   ├── request-limiter.ts          # Concurrency control
│   └── index.ts
│
├── adapters/               # Vendor-specific adapters
│   ├── onvif/
│   │   ├── onvif-soap-builder.ts   # SOAP construction
│   │   ├── onvif-parser.ts         # XML parsing
│   │   ├── onvif-client.ts         # High-level operations
│   │   ├── onvif-recorder-adapter.ts
│   │   └── index.ts
│   │
│   ├── hikvision/
│   │   ├── hikvision-parser.ts     # XML parsing
│   │   ├── hikvision-client.ts     # ISAPI operations
│   │   ├── hikvision-recorder-adapter.ts
│   │   └── index.ts
│   │
│   └── dahua/              # TODO: Implement
│
├── core/                   # Orchestration & assessment
│   ├── recorder-evidence.service.ts  # Orchestration
│   ├── recorder-adapter.factory.ts   # Adapter creation
│   ├── recorder-evidence-evaluator.ts # Assessment
│   └── index.ts
│
└── persistence/            # Evidence storage
    ├── evidence-repository.ts
    ├── migrations/
    │   └── 001_evidence_tables.sql
    └── index.ts
```

## Usage Examples

### 1. Collect Evidence

```typescript
const evidenceService = new RecorderEvidenceService(adapterFactory);

const result = await evidenceService.collectEvidence({
  recorderId: 'rec-123',
  tenantId: 'tenant-456',
  recorderUrl: 'http://192.168.1.100',
  adapterType: 'onvif', // or 'hikvision', 'dahua', 'auto'
  credentials: {
    username: 'admin',
    password: 'password'
  },
  options: {
    skipChannelDetails: false, // Get full channel status
    skipStorage: false,
    priority: RequestPriority.NORMAL
  }
});

// Result contains:
// - evidence: Complete snapshot
// - success: Whether collection succeeded
// - partial: Whether some operations failed
// - errors: List of failures
```

### 2. Evaluate Evidence

```typescript
const evaluator = new RecorderEvidenceEvaluator();

const assessment = evaluator.evaluateRecorder(evidence);

// Assessment contains:
// - status: HEALTHY, DEGRADED, FAILED, UNKNOWN
// - reasons: Array of issue codes
// - channels: Per-channel assessments
// - storage: Storage health
// - health: Connectivity/auth/clock status
```

### 3. Persist Evidence

```typescript
const repository = new EvidenceRepository(dbPool);

// Save snapshot
const snapshotId = await repository.saveEvidence(evidence);

// Retrieve latest
const latest = await repository.getLatestEvidence(recorderId);

// Query history
const history = await repository.getEvidenceHistory(
  recorderId,
  startTime,
  endTime
);
```

### 4. Auto-detect Recorder Type

```typescript
const probe = await evidenceService.probeRecorder(
  recorderId,
  recorderUrl,
  credentials
);

if (probe.state === 'OBSERVED') {
  const adapterType = probe.value.supportedAdapters[0].type;
  console.log(`Detected: ${adapterType}`);
}
```

## Adapter Implementation Guide

### Creating a New Adapter

1. **Implement RecorderAdapter interface:**

```typescript
export class MyRecorderAdapter implements RecorderAdapter {
  getType(): RecorderAdapterType {
    return 'my_vendor';
  }

  async getDeviceInfo(): Promise<EvidenceValue<DeviceInfo>> {
    const source = {
      adapter: this.getType(),
      operation: 'getDeviceInfo',
      protocol: 'http'
    };

    try {
      const info = await this.client.fetchDeviceInfo();
      return observed(info, source);
    } catch (error) {
      return fromError<DeviceInfo>(error, source);
    }
  }

  // Implement all required methods...
}
```

2. **Never invent values:**

```typescript
// ❌ WRONG
async getStorageStatus() {
  return observed({ totalBytes: 0, usedBytes: 0 }, source);
}

// ✅ CORRECT
async getStorageStatus() {
  return unsupported(source, 'Storage API not available on this device');
}
```

3. **Use evidence helpers:**

```typescript
import {
  observed,
  unknown,
  unsupported,
  authFailed,
  timedOut,
  unreachable,
  malformed,
  fromError
} from '../contracts/evidence-helpers.js';
```

4. **Preserve observation metadata:**

```typescript
return observed(value, source, {
  confidence: 1.0,      // Direct observation
  latencyMs: 245,       // Request latency
  rawReference: 'xyz'   // Optional debug reference
});
```

## Evidence Collection Tiers

Different operations have different costs and frequencies:

### Fast Check (every 30-60 seconds)
- Reachability
- Authentication
- Basic status
- Storage

### Channel Check (every few minutes)
- Channel enumeration
- Stream state
- Recording state

### Deep Verify (every 15-60 minutes)
- Latest archive
- Archive search
- Playback verification

## Testing

### Contract Tests

All adapters must pass the same contract suite:

```typescript
describeRecorderAdapterContract(() => createMyAdapter());
```

Validates:
- Timeout never becomes `OBSERVED(false)`
- Auth error never becomes `UNKNOWN`
- Unsupported operation becomes `UNSUPPORTED`
- Malformed XML never crashes worker
- Credentials never appear in evidence

### Parser Tests

Use fixture-driven testing:

```
test/fixtures/
  my_vendor/
    device-info.xml
    channels.xml
    error-response.xml
```

### Integration Tests

Use fake server implementations to test complete flow without physical devices.

## Database Schema

### Evidence Snapshots

```sql
recorder_evidence_snapshots
- id (uuid)
- tenant_id, branch_id, recorder_id
- adapter_type
- collected_at
- reachable_state, reachable_value
- authenticated_state, authenticated_value
- device info, storage, device time
- raw_metadata (jsonb)
```

### Channel Evidence

```sql
recorder_channel_evidence
- id (uuid)
- snapshot_id → recorder_evidence_snapshots
- channel_id, name
- enabled, stream_reachable, video_present
- recording_configured, recording_active
- latest_recording_at
- archive_playable
```

### Views

- `recorder_latest_evidence` - Most recent snapshot per recorder
- `recorder_latest_channel_evidence` - Most recent channel evidence
- `recorder_recording_compliance` - Compliance summary
- `recorder_storage_health` - Storage health status

## Integration with Recording Compliance

Recording Compliance Service should consume evidence:

```typescript
// ❌ OLD: Direct adapter calls
const status = await recorder.getRecordingStatus();

// ✅ NEW: Consume persisted evidence
const evidence = await evidenceRepository.getLatestEvidence(recorderId);
const assessment = evaluator.evaluateRecorder(evidence);

if (assessment.recordingCompliance === 'NON_COMPLIANT') {
  // Raise alert
}
```

## Performance Considerations

1. **Concurrency Limits**
   - Per-recorder: 4 concurrent requests
   - Global pool: 50 concurrent requests
   - Request queuing with priority

2. **Caching**
   - Capabilities: Cache 24 hours
   - Profiles: Cache 1 hour
   - Status: No caching (always fresh)

3. **Batch Operations**
   - Channel queries: 3 concurrent
   - Avoid N+1 queries

4. **Timeouts**
   - Device info: 5 seconds
   - Channel list: 5 seconds
   - Archive search: 10 seconds
   - RTSP verify: 8 seconds

## Error Handling

All errors are normalized to evidence states:

```
Network errors → UNREACHABLE
Timeouts       → TIMEOUT
Auth failures  → AUTH_FAILED
Parse errors   → MALFORMED_RESPONSE
Rate limiting  → RATE_LIMITED
Device errors  → DEVICE_ERROR
Unknown        → UNKNOWN
```

## Deployment

1. Run database migrations
2. Configure recorder connections
3. Enable evidence collection schedules
4. Configure retention policies (default: 90 days)
5. Set up monitoring alerts

## Migration from Old System

1. Deploy new adapter infrastructure
2. Run both systems in parallel
3. Compare evidence vs old health checks
4. Migrate compliance services to evidence-based
5. Deprecate old direct recorder calls
6. Remove old adapter implementations

## Monitoring

Key metrics:
- `recorder_requests_total`
- `recorder_request_duration_ms`
- `recorder_request_failures_total`
- `recorder_evidence_unknown_total`
- `recorder_auth_failures_total`

## Future Enhancements

- [ ] Dahua adapter implementation
- [ ] Generic RTSP adapter
- [ ] Axis adapter
- [ ] Uniview adapter
- [ ] Real RTSP stream verification
- [ ] Playback verification
- [ ] Multi-adapter fallback per operation
- [ ] Certified device matrix
- [ ] Device capability database

## References

- ONVIF Core Specification
- Hikvision ISAPI Documentation
- Evidence-Based Architecture Patterns
- Recording Compliance Requirements
