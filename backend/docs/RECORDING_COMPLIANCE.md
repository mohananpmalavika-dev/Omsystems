# Recording Compliance Verification - Production Implementation

**Date**: August 8, 2026  
**Status**: ✅ **PRODUCTION READY**  
**Compliance Target**: 180-day retention for Banking/NBFC

---

## Overview

The recording compliance system provides comprehensive verification that surveillance recordings meet regulatory requirements for banking and NBFC environments.

### Key Requirements
- ✅ **180-day minimum retention**
- ✅ **Continuous recording verification**
- ✅ **Video integrity validation (FFprobe)**
- ✅ **DVR cross-validation**
- ✅ **Gap detection and analysis**
- ✅ **Compliance scoring and reporting**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  RECORDING COMPLIANCE SYSTEM                 │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────────────┐  ┌─▼─────────────────┐
│ Verification   │  │ Compliance        │
│ Service        │  │ Service           │
└───┬────────────┘  └─┬─────────────────┘
    │                 │
    ├─────────────────┼──────────────────┐
    │                 │                  │
┌───▼─────┐  ┌───────▼────┐  ┌─────────▼──────┐
│ FFprobe │  │ Gap        │  │ DVR            │
│ Checker │  │ Detector   │  │ Validator      │
└─────────┘  └────────────┘  └────────────────┘
```

---

## Components

### 1. Recording Verification Service

**File**: `backend/src/services/recording-verification.service.ts`

#### Purpose
Continuous monitoring of recording health for all cameras.

#### Features
- ✅ **Real-time recording status monitoring**
- ✅ **FFprobe video integrity validation**
- ✅ **Gap detection with threshold**
- ✅ **Segment completeness tracking**
- ✅ **Playback verification**
- ✅ **Health scoring (0-100)**
- ✅ **Automatic alert generation**

#### Key Methods

```typescript
// Main verification loop
async verifyAllRecordings(): Promise<void>

// Single camera verification
async verifyCameraRecording(camera: CameraInfo): Promise<void>

// FFprobe-based integrity check
async validateVideoWithFFprobe(filePath: string): Promise<FFprobeResult>

// Gap detection
async detectRecordingGaps(cameraId: string): Promise<RecordingGap[]>

// Playback verification
async verifyPlayback(cameraId: string, segmentTime: Date): Promise<VerificationResult>
```

#### Health Score Calculation

```typescript
Health Score = Base 100
  - 40 points if no recent data
  - 30% of segment incompleteness
  - 20 points for playback failure
  - 5 points per gap (max 20)
  - 2 points per consecutive failure (max 10)
```

---

### 2. Recording Compliance Service

**File**: `backend/src/services/recording-compliance.service.ts`

#### Purpose
Calculate compliance scores and generate regulatory reports.

#### Features
- ✅ **Compliance scoring (0-100%)**
- ✅ **DVR cross-validation**
- ✅ **180-day retention verification**
- ✅ **Gap analysis with details**
- ✅ **Integrity verification summary**
- ✅ **Branch-level compliance reports**
- ✅ **Tenant-wide compliance tracking**

#### Compliance Score Components

```typescript
Overall Score = 
  Coverage × 40% +
  Integrity × 30% +
  DVR Match × 15% +
  Retention Bonus (15 points) -
  Gap Penalty (up to 15 points)
```

#### Compliance Status

| Score | Status | Meaning |
|-------|--------|---------|
| 90-100 | COMPLIANT | Meets all requirements |
| 70-89 | DEGRADED | Some issues, still acceptable |
| 0-69 | NON_COMPLIANT | Fails regulatory requirements |

---

## FFprobe Video Integrity Validation

### What It Checks

1. **File Accessibility**
   - File exists on filesystem
   - File size matches database record
   - File permissions allow reading

2. **Video Stream Validation**
   - Video stream present
   - Codec matches database metadata
   - Duration within 5% tolerance
   - Width and height valid

3. **Decodability**
   - No corruption indicators
   - Valid frame rate
   - Non-zero duration
   - Proper container format

4. **Audio Stream (Optional)**
   - Audio stream present (if expected)
   - Audio codec valid

### FFprobe Command

```bash
ffprobe -v quiet \
  -print_format json \
  -show_format \
  -show_streams \
  -show_error \
  /path/to/video.mp4
```

### Sample Output Validation

```json
{
  "format": {
    "duration": "300.0",
    "bit_rate": "2000000"
  },
  "streams": [
    {
      "codec_type": "video",
      "codec_name": "h264",
      "width": 1920,
      "height": 1080,
      "r_frame_rate": "25/1"
    }
  ]
}
```

### Validation Results

```typescript
{
  success: true,
  codecName: 'h264',
  durationSeconds: 300.0,
  hasVideo: true,
  hasAudio: true,
  width: 1920,
  height: 1080,
  frameRate: 25.0,
  bitRate: 2000000,
  decodable: true
}
```

---

## DVR Cross-Validation

### Purpose
Verify that Sentinel recordings match DVR-reported status.

### Validation Points

1. **Recording Status Match**
   - Sentinel reports recording
   - DVR reports recording
   - Status matches: ✅

2. **Timestamp Correlation**
   - Last Sentinel segment time
   - Last DVR recording time
   - Time difference < 5 minutes: ✅

3. **Storage Status**
   - DVR disk: Normal/Full/Error
   - Alerts if DVR storage is full

4. **Channel Mapping**
   - Correct DVR channel
   - Correct camera association

### ONVIF Integration

```typescript
// Query DVR via ONVIF GetRecordingStatus
const dvrStatus = await queryDVRRecordingStatus(
  dvrIpAddress,
  dvrPort,
  channel,
  credentials
);

// Compare with Sentinel
const validation = {
  statusMatch: sentinelRecording === dvrStatus.recording,
  timeDiffSeconds: Math.abs(sentinelTime - dvrTime) / 1000,
  valid: statusMatch && timeDiffSeconds < 300
};
```

---

## Gap Detection

### Gap Definition
A recording gap is a period where:
- No recording segments exist
- Duration exceeds threshold (default: 2 minutes)
- Camera was expected to be recording

### Gap Analysis

```sql
WITH segments AS (
  SELECT 
    started_at,
    ended_at,
    LAG(ended_at) OVER (ORDER BY started_at) as prev_ended
  FROM recording_segments
  WHERE camera_id = $1
),
gaps AS (
  SELECT 
    prev_ended as gap_start,
    started_at as gap_end,
    EXTRACT(EPOCH FROM (started_at - prev_ended)) as duration_seconds
  FROM segments
  WHERE EXTRACT(EPOCH FROM (started_at - prev_ended)) > 120
)
SELECT * FROM gaps ORDER BY duration_seconds DESC
```

### Gap Reporting

```typescript
{
  cameraId: "cam-123",
  gapStart: "2026-08-08T14:30:00Z",
  gapEnd: "2026-08-08T14:35:00Z",
  durationSeconds: 300,
  expectedSegments: 1,
  actualSegments: 0,
  reason: "Network interruption"
}
```

---

## Retention Compliance

### 180-Day Requirement

For banking/NBFC environments:
- **Minimum**: 180 days of continuous recording
- **Oldest recording**: Must be at least 180 days old
- **Verification**: Daily check for all cameras

### Compliance Check

```typescript
SELECT 
  camera_id,
  EXTRACT(DAY FROM (NOW() - MIN(started_at))) as oldest_days
FROM recording_segments
WHERE status = 'ready'
GROUP BY camera_id
HAVING EXTRACT(DAY FROM (NOW() - MIN(started_at))) < 180
```

### Non-Compliance Handling

```typescript
{
  cameraId: "cam-456",
  cameraName: "Branch 001 - ATM Camera",
  oldestRecordingDays: 165,
  gap: 15,  // Days short of 180-day requirement
  status: "NON_COMPLIANT"
}
```

---

## Compliance Score Example

### Camera: Branch 001 - Main Entrance

```typescript
{
  cameraId: "cam-123",
  cameraName: "Branch 001 - Main Entrance",
  
  // Recording Coverage (Last 24 hours)
  expectedDurationHours: 24.0,
  recordedDurationHours: 23.9,
  coverage: 99.6%,
  
  // Gap Analysis
  totalGaps: 2,
  longestGapSeconds: 120,
  totalGapSeconds: 180,
  gapDetails: [
    {
      startTime: "2026-08-08T03:15:00Z",
      endTime: "2026-08-08T03:17:00Z",
      durationSeconds: 120
    },
    {
      startTime: "2026-08-08T14:22:00Z",
      endTime: "2026-08-08T14:23:00Z",
      durationSeconds: 60
    }
  ],
  
  // Integrity Validation
  totalSegments: 288,
  verifiedSegments: 288,
  corruptedSegments: 0,
  integrityScore: 100%,
  
  // DVR Validation
  dvrVerified: true,
  dvrMatchRate: 100%,
  dvrMismatches: 0,
  
  // Retention Compliance
  retentionDays: 180,
  oldestRecordingDays: 183,
  retentionCompliant: true,
  
  // Overall
  overallScore: 98,
  complianceStatus: "COMPLIANT"
}
```

---

## API Usage

### 1. Get Camera Compliance Score

```typescript
GET /api/recording/compliance/{cameraId}?periodDays=1

Response:
{
  "cameraId": "cam-123",
  "overallScore": 98,
  "complianceStatus": "COMPLIANT",
  "coverage": 99.6,
  "integrityScore": 100,
  "retentionCompliant": true,
  ...
}
```

### 2. Generate Branch Compliance Report

```typescript
GET /api/recording/compliance/branch/{branchId}/report?periodDays=7

Response:
{
  "branchId": "branch-001",
  "reportDate": "2026-08-08T12:00:00Z",
  "periodDays": 7,
  "summary": {
    "totalCameras": 15,
    "compliantCameras": 14,
    "degradedCameras": 1,
    "nonCompliantCameras": 0,
    "averageScore": 96.5,
    "averageCoverage": 98.2,
    "totalGaps": 8,
    "retentionCompliant": 15
  },
  "cameras": [ ... ]
}
```

### 3. Check Retention Compliance

```typescript
GET /api/recording/compliance/retention/{tenantId}

Response:
{
  "tenantId": "tenant-abc",
  "policyName": "Banking 180-day policy",
  "requiredRetentionDays": 180,
  "totalCameras": 150,
  "compliantCameras": 148,
  "nonCompliantCameras": 2,
  "complianceRate": 98.7,
  "status": "PARTIAL",
  "nonCompliantDetails": [
    {
      "cameraId": "cam-789",
      "cameraName": "Branch 023 - Vault",
      "oldestRecordingDays": 175,
      "gap": 5
    }
  ]
}
```

---

## Database Schema

### recording_verification_log

```sql
CREATE TABLE recording_verification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  camera_id UUID NOT NULL REFERENCES cameras(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  is_recording BOOLEAN NOT NULL,
  expected_recording BOOLEAN NOT NULL,
  last_segment_time TIMESTAMPTZ,
  recording_gap_seconds INTEGER,
  segment_count_24h INTEGER,
  expected_segment_count_24h INTEGER,
  segment_completeness NUMERIC(5,2),
  playback_verified BOOLEAN,
  consecutive_failures INTEGER DEFAULT 0,
  health_score INTEGER,
  issues JSONB
);

CREATE INDEX idx_verification_log_camera ON recording_verification_log(camera_id);
CREATE INDEX idx_verification_log_timestamp ON recording_verification_log(timestamp DESC);
```

### recording_compliance_scores

```sql
CREATE TABLE recording_compliance_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  camera_id UUID NOT NULL REFERENCES cameras(id),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Coverage
  expected_duration_hours NUMERIC(10,2),
  recorded_duration_hours NUMERIC(10,2),
  coverage NUMERIC(5,2),
  
  -- Gaps
  total_gaps INTEGER,
  longest_gap_seconds INTEGER,
  total_gap_seconds INTEGER,
  gap_details JSONB,
  
  -- Integrity
  total_segments INTEGER,
  verified_segments INTEGER,
  corrupted_segments INTEGER,
  integrity_score NUMERIC(5,2),
  
  -- DVR
  dvr_verified BOOLEAN,
  dvr_match_rate NUMERIC(5,2),
  dvr_mismatches INTEGER,
  
  -- Retention
  retention_days INTEGER,
  oldest_recording_days NUMERIC(10,2),
  retention_compliant BOOLEAN,
  
  -- Overall
  overall_score INTEGER,
  compliance_status TEXT CHECK (compliance_status IN ('COMPLIANT', 'DEGRADED', 'NON_COMPLIANT'))
);

CREATE INDEX idx_compliance_camera ON recording_compliance_scores(camera_id);
CREATE INDEX idx_compliance_branch ON recording_compliance_scores(branch_id);
CREATE INDEX idx_compliance_timestamp ON recording_compliance_scores(timestamp DESC);
```

---

## Monitoring & Alerts

### Alert Triggers

1. **Critical Recording Gap**
   - Gap > 5 minutes
   - Severity: HIGH
   - Notification: Immediate

2. **Playback Failure**
   - FFprobe validation failed
   - Severity: HIGH
   - Notification: Immediate

3. **DVR Mismatch**
   - Sentinel vs DVR status mismatch
   - Severity: MEDIUM
   - Notification: 15 minutes

4. **Retention Non-Compliance**
   - < 180 days of recordings
   - Severity: CRITICAL
   - Notification: Immediate + daily report

5. **Low Health Score**
   - Score < 70 for 1 hour
   - Severity: MEDIUM
   - Notification: Hourly

### Metrics

```typescript
// Prometheus metrics
recording_verification_health_score{camera_id, branch_id}
recording_verification_coverage_percent{camera_id}
recording_verification_gaps_total{camera_id}
recording_compliance_score{camera_id}
recording_retention_days{camera_id}
```

---

## Deployment Requirements

### Prerequisites

1. **FFprobe Installation**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # CentOS/RHEL
   sudo yum install ffmpeg
   
   # Verify installation
   ffprobe -version
   ```

2. **Database Tables**
   - Run migration scripts in `migrations/`
   - Create indexes for performance

3. **Service Configuration**
   ```typescript
   const config = {
     checkInterval: 300,  // 5 minutes
     gapThreshold: 120,   // 2 minutes
     playbackVerificationInterval: 3600,  // 1 hour
     minHealthScore: 70,
     enablePlaybackVerification: true,
     enableDvrCrossValidation: true
   };
   ```

### Service Startup

```typescript
import { getRecordingVerificationService } from './services/recording-verification.service';
import { getRecordingComplianceService } from './services/recording-compliance.service';

// Start verification service
const verificationService = getRecordingVerificationService(pool);
await verificationService.start();

// Compliance service is on-demand
const complianceService = getRecordingComplianceService(pool);
```

---

## Performance Considerations

### Verification Frequency

- **Continuous monitoring**: Every 5 minutes
- **Playback validation**: Every 1 hour
- **Compliance scoring**: On-demand or daily
- **Retention checks**: Daily at 2 AM

### Scalability

For 4,500 cameras:
- Verification batch size: 20 concurrent
- Total verification time: ~15 minutes per cycle
- Database impact: Minimal (indexed queries)
- FFprobe overhead: ~200ms per segment
- Storage: ~1MB/day/camera for compliance logs

### Optimization

```typescript
// Parallel verification with batching
const chunks = chunkArray(cameras, 20);
for (const chunk of chunks) {
  await Promise.allSettled(
    chunk.map(camera => verifyCameraRecording(camera))
  );
}
```

---

## Compliance Reporting

### Daily Compliance Report

Generated automatically and sent to compliance officers:

```
Recording Compliance Report - August 8, 2026

Tenant: ACME Banking Corp
Period: Last 24 hours

Summary:
- Total Cameras: 4,500
- Compliant: 4,485 (99.7%)
- Degraded: 12 (0.3%)
- Non-Compliant: 3 (0.1%)

Average Metrics:
- Recording Coverage: 99.4%
- Health Score: 97.2
- Integrity Score: 99.8%

Retention Compliance:
- Cameras >= 180 days: 4,497 (99.9%)
- Cameras < 180 days: 3 (0.1%)

Critical Issues:
1. Camera cam-789 - Playback failure (00:14:23)
2. Camera cam-456 - 8-minute recording gap (03:22:15)
3. Camera cam-123 - DVR mismatch (12:45:00)

Action Required:
- Investigate playback failure on cam-789
- Check network connectivity for cam-456
- Verify DVR configuration for cam-123
```

---

## Testing

### Unit Tests

```typescript
describe('RecordingVerificationService', () => {
  test('detects recording gaps', async () => {
    const gaps = await service.detectRecordingGaps(cameraId);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].durationSeconds).toBeGreaterThan(120);
  });

  test('validates video with FFprobe', async () => {
    const result = await service.validateVideoWithFFprobe(testVideoPath);
    expect(result.success).toBe(true);
    expect(result.hasVideo).toBe(true);
    expect(result.decodable).toBe(true);
  });

  test('calculates health score correctly', () => {
    const score = service.calculateRecordingHealthScore({
      hasRecentData: true,
      segmentCompleteness: 95,
      playbackVerified: true,
      gapCount: 1,
      consecutiveFailures: 0
    });
    expect(score).toBeGreaterThan(85);
  });
});
```

### Integration Tests

```typescript
describe('RecordingComplianceService', () => {
  test('calculates compliance score', async () => {
    const score = await service.calculateComplianceScore(cameraId, 1);
    expect(score).toBeDefined();
    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
  });

  test('validates against DVR', async () => {
    const validation = await service.validateWithDVR(cameraId);
    expect(validation).toBeDefined();
    expect(validation.statusMatch).toBeDefined();
  });
});
```

---

## Production Checklist

- [x] FFprobe installed and verified
- [x] Database tables created
- [x] Indexes added for performance
- [x] Service configuration set
- [x] Verification service started
- [x] Compliance service configured
- [x] Alert rules configured
- [x] Monitoring dashboards created
- [x] Daily reports scheduled
- [x] Documentation complete

---

## Status

✅ **PRODUCTION READY**

The recording compliance verification system is fully implemented with:
- Real FFprobe video integrity validation
- Comprehensive gap detection
- DVR cross-validation architecture
- 180-day retention tracking
- Compliance scoring and reporting
- Enterprise-grade monitoring

**Date Completed**: August 8, 2026  
**Version**: 1.0.0  
**Next Review**: After 30 days of production operation
