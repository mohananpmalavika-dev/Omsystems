# Recorder Integration - Quick Reference

## Common Patterns

### 1. Collect Evidence

```typescript
import { RecorderEvidenceService } from './recorders/core';
import { RequestPriority } from './recorders/transport';

const evidenceService = new RecorderEvidenceService(adapterFactory);

const result = await evidenceService.collectEvidence({
  recorderId: 'rec-123',
  tenantId: 'tenant-456',
  recorderUrl: 'http://192.168.1.100',
  adapterType: 'auto', // or 'onvif', 'hikvision'
  credentials: { username: 'admin', password: 'pass' },
  options: {
    skipChannelDetails: false,
    priority: RequestPriority.NORMAL
  }
});

console.log(result.evidence);
console.log(result.success);
console.log(result.errors);
```

### 2. Evaluate Evidence

```typescript
import { RecorderEvidenceEvaluator } from './recorders/core';

const evaluator = new RecorderEvidenceEvaluator();
const assessment = evaluator.evaluateRecorder(evidence);

console.log(assessment.status); // HEALTHY, DEGRADED, FAILED, UNKNOWN
console.log(assessment.reasons); // ['STORAGE_FULL', 'RECORDING_STOPPED']
console.log(assessment.channels); // Per-channel assessments
```

### 3. Check Evidence State

```typescript
import { isObserved } from './recorders/contracts';

// Check if value was successfully observed
if (isObserved(evidence.recordingActive)) {
  const isRecording = evidence.recordingActive.value;
  console.log(`Recording: ${isRecording}`);
} else {
  console.log(`Cannot verify: ${evidence.recordingActive.state}`);
}
```

### 4. Persist Evidence

```typescript
import { EvidenceRepository } from './recorders/persistence';

const repository = new EvidenceRepository(pool);

// Save
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

### 5. Create Evidence Values

```typescript
import {
  observed,
  unknown,
  unsupported,
  authFailed,
  timedOut
} from './recorders/contracts';

// Success
return observed(
  { recording: true },
  { adapter: 'hikvision', operation: 'getRecordingStatus' },
  { latencyMs: 245 }
);

// Failure
return unknown(
  { adapter: 'hikvision', operation: 'getRecordingStatus' },
  'Query failed',
  { httpStatus: 500 }
);

// Unsupported
return unsupported(
  { adapter: 'onvif', operation: 'getStorageStatus' },
  'ONVIF does not provide detailed storage status'
);
```

## Decision Tree

### When to Use What

```
Need recorder data?
  ├─ Historical/trending? → Query EvidenceRepository
  ├─ Current status? → Check cache age
  │   ├─ Fresh (< 5 min)? → Use cached evidence
  │   └─ Stale? → Collect new evidence
  └─ Real-time verification? → Collect evidence with HIGH priority

Need to make decision?
  └─ Use RecorderEvidenceEvaluator (never make policy in adapter)

Need to build adapter?
  ├─ Implement RecorderAdapter interface
  ├─ Return EvidenceValue<T> for all operations
  ├─ Never invent values
  └─ Use evidence helpers
```

## Evidence States Cheat Sheet

| State | Meaning | When to Use |
|-------|---------|-------------|
| `OBSERVED` | Successfully retrieved value | Value was obtained and verified |
| `UNKNOWN` | Observation failed | Generic failure, cause unclear |
| `UNSUPPORTED` | Not implemented | Device/adapter doesn't have capability |
| `AUTH_FAILED` | Authentication prevented | Credentials rejected |
| `TIMEOUT` | Operation timed out | Request exceeded time limit |
| `UNREACHABLE` | Network/device unreachable | Connection failed |
| `MALFORMED_RESPONSE` | Response unparseable | Received invalid data |
| `RATE_LIMITED` | Temporarily throttled | Too many requests |
| `DEVICE_ERROR` | Recorder internal error | Device reported error |

## Common Mistakes

### ❌ Wrong

```typescript
// 1. Treating unknown as false
if (!evidence.recording.value) {
  return 'NON_COMPLIANT';
}

// 2. Inventing values
return observed({ healthy: true }, source);

// 3. Making policy decisions in adapter
async getCompliance() {
  const recording = await this.getRecordingStatus();
  return recording ? 'COMPLIANT' : 'NON_COMPLIANT';
}

// 4. Ignoring evidence state
const recording = evidence.recording.value || false;

// 5. Not checking observedAt
if (evidence.recording.value) {
  // What if this is 2 days old?
}
```

### ✅ Correct

```typescript
// 1. Explicit unknown handling
if (evidence.recording.state !== 'OBSERVED') {
  return { status: 'UNKNOWN', reason: 'INSUFFICIENT_EVIDENCE' };
}

// 2. Return only observed facts
return observed({ recording: true, lastSeen: new Date() }, source);

// 3. Policy in evaluator
const assessment = evaluator.evaluateRecorder(evidence);
return assessment.recordingCompliance;

// 4. Check state before value
if (isObserved(evidence.recording)) {
  const recording = evidence.recording.value;
}

// 5. Check freshness
const age = Date.now() - evidence.observedAt.getTime();
if (age > MAX_AGE) {
  // Evidence too old
}
```

## API Quick Reference

### RecorderEvidenceService

```typescript
// Probe device
probeRecorder(recorderId, url, credentials): Promise<EvidenceValue<RecorderProbe>>

// Collect evidence
collectEvidence(config): Promise<EvidenceCollectionResult>

// Search recordings
searchRecordings(recorderId, url, adapterType, credentials, request): Promise<EvidenceValue<Segments[]>>

// Statistics
getRecorderStats(recorderId): RequestStats
getGlobalStats(): GlobalStats
```

### RecorderEvidenceEvaluator

```typescript
// Evaluate recorder
evaluateRecorder(evidence): RecorderAssessment

// Evaluate single channel
evaluateChannel(channel): ChannelAssessment

// Detect conflicts
detectConflicts(evidence): Conflict[]

// Calculate compliance score
calculateComplianceScore(channels): number
```

### EvidenceRepository

```typescript
// Save
saveEvidence(evidence): Promise<string>

// Retrieve
getLatestEvidence(recorderId): Promise<Row | null>
getLatestChannelEvidence(recorderId, channelId): Promise<Row | null>

// History
getEvidenceHistory(recorderId, start, end): Promise<Row[]>
getChannelEvidenceHistory(recorderId, channelId, start, end): Promise<Row[]>

// Maintenance
getRecordersWithStaleEvidence(thresholdMs): Promise<Array>
deleteOldEvidence(retentionDays): Promise<number>
```

## Database Views

```sql
-- Latest evidence per recorder
SELECT * FROM recorder_latest_evidence WHERE recorder_id = $1;

-- Latest channel evidence
SELECT * FROM recorder_latest_channel_evidence 
WHERE recorder_id = $1 AND channel_id = $2;

-- Recording compliance summary
SELECT * FROM recorder_recording_compliance WHERE branch_id = $1;

-- Storage health
SELECT * FROM recorder_storage_health WHERE recorder_id = $1;
```

## Useful Queries

### Find Non-Compliant Recorders

```sql
SELECT
  recorder_id,
  compliance_percent,
  recording_channels,
  enabled_channels
FROM recorder_recording_compliance
WHERE compliance_percent < 100
ORDER BY compliance_percent ASC;
```

### Find Recorders with Stale Evidence

```sql
SELECT
  recorder_id,
  collected_at,
  NOW() - collected_at as age
FROM recorder_latest_evidence
WHERE collected_at < NOW() - INTERVAL '10 minutes'
ORDER BY collected_at ASC;
```

### Find Storage Issues

```sql
SELECT
  recorder_id,
  storage_usage_percent,
  storage_status
FROM recorder_storage_health
WHERE storage_status IN ('WARNING', 'CRITICAL')
ORDER BY storage_usage_percent DESC;
```

## Testing Patterns

### Unit Test Adapter

```typescript
it('returns observed when successful', async () => {
  const adapter = new OnvifRecorderAdapter(config);
  const result = await adapter.getDeviceInfo();
  
  expect(result.state).toBe('OBSERVED');
  expect(result.value).toMatchObject({
    manufacturer: expect.any(String),
    model: expect.any(String)
  });
});

it('returns auth-failed when credentials invalid', async () => {
  const adapter = new OnvifRecorderAdapter(badConfig);
  const result = await adapter.testAuthentication();
  
  expect(result.state).toBe('AUTH_FAILED');
  expect(result.error?.code).toBe('AUTH_FAILED');
});
```

### Integration Test

```typescript
it('collects complete evidence', async () => {
  const result = await evidenceService.collectEvidence(config);
  
  expect(result.success).toBe(true);
  expect(result.evidence.reachable.state).toBe('OBSERVED');
  expect(result.evidence.channels.state).toBe('OBSERVED');
  expect(result.errors).toHaveLength(0);
});
```

### Fixture-Based Parser Test

```typescript
it('parses Hikvision device info', async () => {
  const xml = loadFixture('hikvision/device-info.xml');
  const info = await parser.parseDeviceInfo(xml);
  
  expect(info).toMatchObject({
    manufacturer: 'Hikvision',
    model: expect.any(String),
    firmwareVersion: expect.any(String)
  });
});
```

## Monitoring

### Key Metrics

```typescript
// Evidence collection
recorder_evidence_collections_total
recorder_evidence_collection_duration_seconds
recorder_evidence_collection_errors_total

// Evidence state distribution
recorder_evidence_state_total{state="OBSERVED"}
recorder_evidence_state_total{state="UNKNOWN"}
recorder_evidence_state_total{state="AUTH_FAILED"}

// Request limiter
recorder_active_requests{recorder_id}
recorder_queued_requests{recorder_id}
recorder_request_failures_total
```

### Health Checks

```typescript
// Check evidence freshness
const staleRecorders = await repository.getRecordersWithStaleEvidence(
  10 * 60 * 1000 // 10 minutes
);

if (staleRecorders.length > 0) {
  console.warn(`${staleRecorders.length} recorders have stale evidence`);
}

// Check global stats
const stats = evidenceService.getGlobalStats();
console.log(`Active requests: ${stats.activeRequests}`);
console.log(`Queued requests: ${stats.totalQueued}`);
```

## Environment Variables

```bash
# Evidence collection
EVIDENCE_COLLECTION_INTERVAL_MS=300000  # 5 minutes
EVIDENCE_MAX_AGE_MS=600000              # 10 minutes
EVIDENCE_RETENTION_DAYS=90

# Request limits
RECORDER_MAX_CONCURRENT_PER_DEVICE=4
RECORDER_MAX_CONCURRENT_GLOBAL=50
RECORDER_REQUEST_TIMEOUT_MS=10000

# Database
DATABASE_POOL_SIZE=20
DATABASE_QUERY_TIMEOUT_MS=5000
```

## Troubleshooting

### Evidence Always UNKNOWN

1. Check recorder connectivity: `ping <recorder-ip>`
2. Check credentials: test in browser/Postman
3. Check adapter logs for specific error
4. Verify adapter type matches device
5. Check firewall rules

### Authentication Failures

1. Verify credentials are correct
2. Check if device uses Digest auth (Hikvision)
3. Check WS-Security timestamp (ONVIF clock skew)
4. Verify account has sufficient permissions

### Slow Evidence Collection

1. Check request queue stats
2. Reduce concurrent operations
3. Skip detailed channel queries
4. Increase timeouts if network is slow
5. Check if device is overloaded

### Evidence Not Persisting

1. Check database connection
2. Verify migrations ran
3. Check foreign key constraints
4. Review repository logs
5. Check disk space

## Support

- 📖 Full documentation: `backend/src/recorders/README.md`
- 🔧 Implementation details: `backend/src/recorders/IMPLEMENTATION_SUMMARY.md`
- 🔄 Integration guide: `backend/src/recorders/INTEGRATION_GUIDE.md`
- 💬 Questions: Contact platform team
