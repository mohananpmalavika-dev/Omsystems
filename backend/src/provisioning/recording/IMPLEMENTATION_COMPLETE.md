# Recording Verification Implementation - Evidence-Based Pipeline

## Overview

This implementation **completely eliminates synthetic success** from recording verification and replaces it with a comprehensive evidence-based verification pipeline using FFmpeg/FFprobe.

## Critical Changes

### ❌ What Was Removed

1. **Synthetic reachability check** (`return true` based on URL parsing)
2. **Dummy file creation** (100KB buffer pretending to be a recording)
3. **Boolean success indicators** without evidence
4. **Optimistic defaults** that assume success when infrastructure is unavailable

### ✅ What Was Added

A **five-stage verification pipeline** that produces positive evidence:

```
Camera Configuration
        ↓
1. URI Validation ────────→ Parse and validate RTSP URL
        ↓
2. Live Probe ────────────→ FFprobe connects, extracts codec/resolution/FPS
        ↓
3. Frame Observation ─────→ FFmpeg observes actual packets/frames for N seconds
        ↓
4. Sample Recording ──────→ FFmpeg records real video sample to disk
        ↓
5. File Inspection ───────→ FFprobe validates recorded artifact
        ↓
   VERIFIED
```

## Three-State Model

The system now uses a **three-state verification model**:

### `VERIFIED`
- **Meaning:** Positive evidence that camera/recorder is producing valid video
- **Requirements:** 
  - Live stream probed successfully
  - Video stream detected with codec/resolution/FPS
  - Frames observed over time window
  - Real media sample recorded to disk
  - Recorded file independently validated
- **Evidence:** Full metadata from all stages

### `FAILED`
- **Meaning:** Evidence that stream or recording is broken
- **Examples:**
  - `AUTHENTICATION_FAILED`
  - `CONNECTION_REFUSED`
  - `NO_VIDEO_STREAM`
  - `NO_DECODABLE_FRAMES`
  - `RECORDED_FILE_INVALID`
- **Action:** Provisioning should fail or flag for manual intervention

### `UNKNOWN`
- **Meaning:** Verification infrastructure unavailable
- **Examples:**
  - `FFMPEG_UNAVAILABLE`
  - `FFPROBE_UNAVAILABLE`
  - `VERIFICATION_INFRASTRUCTURE_UNAVAILABLE`
- **Action:** Do not block provisioning, but log warning

**Critical Rule:** `UNKNOWN` ≠ success. The system never treats infrastructure absence as evidence of health.

## Architecture

### Core Service Layer

```
RecordingVerifierService
├── Orchestrates verification pipeline
├── Enforces evidence requirements
├── Never returns synthetic success
└── Produces structured results with evidence
```

### Adapter Layer

```
Adapters/
├── FFprobeLiveStreamAdapter      → Probe RTSP streams
├── FFmpegFrameObserverAdapter    → Observe packets/frames
├── FFmpegSampleRecorderAdapter   → Record video samples
└── FFprobeFileInspectorAdapter   → Validate recordings
```

### Utility Layer

```
Utils/
├── subprocess-runner.ts          → Safe process execution
├── rtsp-url-redactor.ts          → Credential sanitization
└── media-error-classifier.ts     → stderr → reason codes
```

### Integration Layer

```
RecordingVerificationAdapter
└── Bridges new verifier with existing provisioning flow
```

## Evidence Persistence

All verification attempts are persisted to `recording_verification_runs` table:

```sql
recording_verification_runs
├── status, stage, reason_code
├── Live stream evidence (codec, width, height, fps, packets, frames)
├── Recording evidence (path, size, duration, frames, codec)
├── Technical diagnostics (durations, exit codes, stderr)
└── Timestamps (started_at, completed_at, verified_at)
```

This provides:
- Complete audit trail
- Compliance evidence
- Debugging diagnostics
- Health trending
- Support diagnostics

## Security Features

### Credential Redaction

All RTSP URLs are sanitized before logging/storage:

```typescript
// Input:  rtsp://admin:secret123@10.0.0.5:554/stream
// Output: rtsp://***:***@10.0.0.5:554/stream
```

Applied to:
- Logs
- Error messages
- Database records
- FFmpeg stderr output

### No Credential Exposure

- Process execution uses arrays (no shell injection)
- stderr is sanitized before storage
- URLs are redacted in all user-facing responses

## Configuration

### Verification Policy

```typescript
{
  probeTimeoutMs: 10_000,
  observationSeconds: 5,
  sampleSeconds: 8,
  minObservedFrames: 3,
  minRecordingDurationSeconds: 3,
  minRecordingFrames: 3,
  minRecordingBytes: 10_000,
  requireDecodableVideo: true,
  transports: ['tcp'],
  maxConcurrentVerifications: 4,
}
```

### Concurrency Control

Prevents resource exhaustion:
- Max 4 concurrent verifications per node (configurable)
- Prevents spawning 64 FFmpeg processes simultaneously
- Queue-based verification for large branch activations

## Integration Changes

### Orchestrator

```typescript
// Before
recordingVerifier = new RecordingVerifierService(pool);

// After
recordingVerifier = new RecordingVerificationAdapter(pool);
```

### Result Handling

```typescript
switch (result.status) {
  case 'VERIFIED':
    // Continue provisioning
    break;
    
  case 'FAILED':
    // Block provisioning with specific reason
    break;
    
  case 'UNKNOWN':
    // Log warning but don't block
    // (infrastructure issue, not camera issue)
    break;
}
```

## Error Classification

FFmpeg/FFprobe stderr is classified into stable reason codes:

```
401 Unauthorized          → AUTHENTICATION_FAILED
Connection refused        → CONNECTION_REFUSED
404 Not Found            → RTSP_ENDPOINT_NOT_FOUND
No video stream          → NO_VIDEO_STREAM
Timeout                  → CONNECTION_TIMEOUT
Command not found        → VERIFICATION_INFRASTRUCTURE_UNAVAILABLE
```

This allows:
- Consistent error handling
- Retry logic for transient failures
- User-friendly error messages
- Automated remediation

## Warnings System

Non-fatal issues are captured as warnings:

```typescript
{
  code: 'CODEC_CHANGED_DURING_RECORDING',
  message: 'Codec changed from h264 to h265 during recording',
  severity: 'medium'
}
```

Examples:
- Codec changes
- Resolution changes
- Low frame rates
- Dimension mismatches

These don't block `VERIFIED` status but are logged for investigation.

## Database Schema

### Camera Columns

```sql
ALTER TABLE cameras
ADD recording_verification_status TEXT,     -- VERIFIED/FAILED/UNKNOWN
ADD recording_verification_reason TEXT,     -- Reason code
ADD recording_verification_stage TEXT,      -- Pipeline stage
ADD recording_verified_at TIMESTAMPTZ,      -- When verified
ADD live_stream_codec TEXT,                 -- Detected codec
ADD live_stream_width INTEGER,              -- Resolution
ADD live_stream_height INTEGER,
ADD live_stream_fps NUMERIC(8,2);           -- Frames per second
```

### Audit Table

Full evidence stored in `recording_verification_runs` with indexes on:
- `camera_id, created_at`
- `branch_id, created_at`
- `status, created_at`
- `tenant_id, created_at`

### Views

```sql
camera_recording_verification_latest  -- Latest result per camera
branch_recording_verification_stats   -- Aggregated by branch
```

## Testing Strategy

### Unit Tests Required

- URI validation (valid/invalid formats)
- Credential redaction
- Frame rate parsing
- Error classification
- Each adapter independently

### Integration Tests Required

- Invalid URI → `FAILED`
- Unreachable host → `FAILED`
- Wrong credentials → `FAILED`
- No video stream → `FAILED`
- No frames → `FAILED`
- Valid stream → `VERIFIED`
- FFmpeg missing → `UNKNOWN`

### Test Infrastructure

Use local RTSP test server (not production cameras):
- MediaMTX or similar
- Generate test streams with known characteristics
- Simulate various failure modes

## Migration Path

### Phase 1: Deploy (No Behavior Change)
1. Deploy new code
2. Run database migration
3. Verify FFmpeg/FFprobe installed on provisioning nodes
4. Monitor logs for initialization

### Phase 2: Enable (Gradual)
1. Enable for pilot branch
2. Monitor verification results
3. Tune policy thresholds
4. Roll out to all branches

### Phase 3: Enforce (Full)
1. Make verification mandatory
2. Block provisioning on `FAILED`
3. Alert on `UNKNOWN` (infrastructure issues)

## Operational Considerations

### Infrastructure Requirements

- FFmpeg must be installed: `apt-get install ffmpeg` or equivalent
- FFprobe must be installed: typically included with FFmpeg
- Sufficient disk space for temporary samples (8-10s @ ~1-5MB each)
- Network access to camera/DVR RTSP ports

### Performance

- URI validation: < 1ms
- Live probe: 2-5 seconds
- Frame observation: 5-8 seconds
- Sample recording: 8-12 seconds
- File inspection: 1-3 seconds

**Total per camera:** ~20-30 seconds

### Monitoring

Key metrics:
- Verification attempts
- Success rate (VERIFIED / total)
- Failure distribution by reason code
- UNKNOWN rate (infrastructure health indicator)
- Average duration per stage

### Troubleshooting

#### All verifications return `UNKNOWN`
- Check FFmpeg/FFprobe installed: `ffmpeg -version`
- Check PATH: `which ffmpeg`
- Check permissions: `ls -la $(which ffmpeg)`

#### High failure rate
- Check network connectivity to cameras
- Verify RTSP credentials
- Check firewall rules (port 554)
- Review failure reason codes

#### Slow verifications
- Reduce `observationSeconds` or `sampleSeconds`
- Increase concurrency limit
- Check network latency

## API Examples

### Verify Single Camera

```typescript
const result = await verifier.verifyCamera(
  cameraId,
  'rtsp://admin:pass@10.0.0.5:554/stream'
);

console.log(result.status);        // VERIFIED | FAILED | UNKNOWN
console.log(result.stage);         // COMPLETE | LIVE_PROBE | etc
console.log(result.liveStream);    // { codec, width, height, fps, ... }
console.log(result.recording);     // { path, sizeBytes, duration, ... }
console.log(result.evidence);      // { probeDurationMs, exitCodes, ... }
```

### Get Branch Statistics

```typescript
const stats = await verifier.getRecordingStats(branchId);

console.log(stats.verifiedCameras);   // Count
console.log(stats.failedCameras);     // Count
console.log(stats.unknownCameras);    // Count
console.log(stats.lastVerifiedAt);    // Timestamp
```

## File Structure

```
backend/src/provisioning/recording/
├── recording-verifier.service.ts           # Core orchestrator
├── recording-verification-adapter.ts       # Integration adapter
├── recording-verification.types.ts         # Type definitions
├── adapters/
│   ├── ffprobe-live-stream.adapter.ts
│   ├── ffmpeg-frame-observer.adapter.ts
│   ├── ffmpeg-sample-recorder.adapter.ts
│   └── ffprobe-file-inspector.adapter.ts
├── utils/
│   ├── subprocess-runner.ts
│   ├── rtsp-url-redactor.ts
│   └── media-error-classifier.ts
├── migrations/
│   └── 001_recording_verification_evidence.sql
└── IMPLEMENTATION_COMPLETE.md
```

## Key Principles Enforced

1. ✅ **No synthetic success** - Every `VERIFIED` requires positive evidence
2. ✅ **Three-state model** - VERIFIED / FAILED / UNKNOWN are distinct
3. ✅ **Infrastructure separation** - FFmpeg unavailable ≠ camera broken
4. ✅ **Evidence persistence** - All results auditable
5. ✅ **Credential security** - RTSP passwords never logged
6. ✅ **Process safety** - Timeouts, cleanup, no zombie processes
7. ✅ **Error classification** - Stable reason codes, not raw stderr
8. ✅ **Concurrency control** - Bounded resource usage

## Compliance Benefits

This implementation provides the foundation for:

- **Recording compliance audits** - Full evidence trail
- **SLA reporting** - Historical verification data
- **Camera health monitoring** - Continuous validation
- **Incident investigation** - Detailed diagnostics
- **Regulatory compliance** - Proof of recording capability

## Next Steps

1. **Deploy migration** to add database columns/tables
2. **Verify infrastructure** (FFmpeg/FFprobe installed)
3. **Test with pilot branch** before full rollout
4. **Monitor verification metrics** and tune policy
5. **Document operational procedures** for troubleshooting

---

## Summary

This implementation transforms recording verification from a **cosmetic check** into a **rigorous evidence-based pipeline** that proves cameras/recorders are actually producing valid video that the system can record and persist.

The key architectural change is that **`VERIFIED` status can only be achieved through positive evidence from actual media**, not from absence of errors, optimistic defaults, or infrastructure unavailability.

This is the reliability boundary a CCTV provisioning system should have.
