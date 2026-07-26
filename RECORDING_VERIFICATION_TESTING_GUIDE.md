# Recording Verification - Testing Guide

**Purpose:** Validate the Recording Verification system implementation  
**Status:** Ready for testing  
**Date:** January 26, 2025

---

## Prerequisites

1. ✅ Backend service running
2. ✅ PostgreSQL database available
3. ✅ Recording verification migration applied
4. ✅ At least 5-10 cameras with recording enabled
5. ✅ Recording segments table populated with test data

---

## Test Suite

### Test 1: Service Initialization ✨

**Objective:** Verify the recording verification service starts correctly

#### Steps:
1. **Start the recording verification service:**
```typescript
import { getRecordingVerificationService } from './services/recording-verification.service.js';

const verificationService = getRecordingVerificationService(pool);
await verificationService.start();
```

2. **Check logs for startup confirmation:**
```
[INFO] Starting recording verification service
[INFO] Recording verification service started
```

3. **Verify initial verification cycle:**
```
[DEBUG] Starting recording verification cycle
[DEBUG] Verifying X cameras
[DEBUG] Recording verification cycle complete
```

#### Success Criteria:
- ✅ Service starts without errors
- ✅ Initial verification cycle completes
- ✅ No exceptions in logs
- ✅ Cameras are being verified

---

### Test 2: Camera Recording Status Verification ✨

**Objective:** Verify basic recording status detection

#### Steps:
1. **Get recording status for a camera:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/status
```

2. **Expected Response (recording camera):**
```json
{
  "success": true,
  "data": {
    "cameraId": "uuid",
    "cameraName": "Camera 1",
    "status": "recording",
    "isRecording": true,
    "expectedRecording": true,
    "lastSegmentTime": "2025-01-26T10:30:00Z",
    "lastVerifiedTime": "2025-01-26T10:35:00Z",
    "recordingGapSeconds": 0,
    "segmentCount24h": 288,
    "expectedSegmentCount24h": 288,
    "segmentCompleteness": 100.0,
    "playbackVerified": true,
    "consecutiveFailures": 0,
    "healthScore": 100,
    "issues": []
  }
}
```

#### Success Criteria:
- ✅ API returns 200 OK
- ✅ Camera status detected correctly
- ✅ Segment count accurate
- ✅ Health score calculated
- ✅ No issues for healthy camera

---

### Test 3: Recording Gap Detection ✨

**Objective:** Verify gap detection algorithm works correctly

#### Setup:
Create a test scenario with a recording gap:

```sql
-- Insert segments with a gap
INSERT INTO recording_segments (camera_id, started_at, ended_at, status) VALUES
  ('camera-uuid', '2025-01-26 10:00:00', '2025-01-26 10:05:00', 'ready'),
  ('camera-uuid', '2025-01-26 10:05:00', '2025-01-26 10:10:00', 'ready'),
  -- GAP of 5 minutes here
  ('camera-uuid', '2025-01-26 10:15:00', '2025-01-26 10:20:00', 'ready');
```

#### Steps:
1. **Trigger manual verification:**
```bash
curl -X POST http://localhost:3000/api/v1/recording/{CAMERA_ID}/verify
```

2. **Get detected gaps:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/gaps?hours=1
```

3. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "gaps": [
      {
        "id": "uuid",
        "cameraId": "uuid",
        "gapStart": "2025-01-26T10:10:00Z",
        "gapEnd": "2025-01-26T10:15:00Z",
        "durationSeconds": 300,
        "expectedSegments": 1,
        "actualSegments": 0,
        "reason": null,
        "detectedAt": "2025-01-26T10:35:00Z",
        "resolvedAt": null
      }
    ],
    "summary": {
      "totalGaps": 1,
      "totalGapDuration": 300,
      "unresolvedGaps": 1,
      "avgGapDuration": 300
    }
  }
}
```

#### Success Criteria:
- ✅ Gap detected correctly
- ✅ Gap duration calculated (5 minutes = 300 seconds)
- ✅ Gap start/end times accurate
- ✅ Expected segments calculated
- ✅ Gap saved to database

---

### Test 4: Segment Completeness Calculation ✨

**Objective:** Verify segment completeness percentage is accurate

#### Setup:
Create segments for 24 hours with some missing:

```sql
-- Expected: 288 segments (24h * 60min / 5min segments)
-- Insert only 275 segments (95.5% completeness)
-- Use a script or procedure to insert test data
```

#### Steps:
1. **Get camera status:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/status
```

2. **Verify segment completeness:**
```json
{
  "segmentCount24h": 275,
  "expectedSegmentCount24h": 288,
  "segmentCompleteness": 95.49
}
```

3. **Check for missing segments issue:**
```json
{
  "issues": [
    {
      "type": "missing_segments",
      "severity": "warning",
      "description": "Only 95.5% of expected segments present",
      "missingSegmentCount": 13
    }
  ]
}
```

#### Success Criteria:
- ✅ Segment count accurate
- ✅ Completeness percentage correct
- ✅ Missing segments detected
- ✅ Issue created for <80% completeness
- ✅ Health score reduced appropriately

---

### Test 5: Health Score Calculation ✨

**Objective:** Verify health score calculation algorithm

#### Test Scenarios:

**Scenario A: Perfect Health**
```
- Has recent data: ✅
- Segment completeness: 100%
- Playback verified: ✅
- Gap count: 0
- Consecutive failures: 0
Expected Score: 100
```

**Scenario B: Minor Issues**
```
- Has recent data: ✅
- Segment completeness: 95%
- Playback verified: ✅
- Gap count: 1
- Consecutive failures: 0
Expected Score: ~93 (100 - 1.5 - 5)
```

**Scenario C: Major Issues**
```
- Has recent data: ❌
- Segment completeness: 80%
- Playback verified: ❌
- Gap count: 3
- Consecutive failures: 2
Expected Score: ~29 (100 - 40 - 6 - 20 - 15 - 4)
```

#### Steps:
1. Create test data for each scenario
2. Trigger verification
3. Verify calculated health scores match expectations

#### Success Criteria:
- ✅ Perfect health = 100 score
- ✅ Minor issues = 85-95 score
- ✅ Major issues = <50 score
- ✅ No recent data severely impacts score
- ✅ Playback failure significantly reduces score

---

### Test 6: Playback Verification ✨

**Objective:** Verify playback integrity checking works

#### Steps:
1. **Create a segment with valid file:**
```sql
INSERT INTO recording_segments 
  (camera_id, started_at, ended_at, file_path, file_size_bytes, status)
VALUES 
  ('camera-uuid', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '55 minutes', 
   '/recordings/test.mp4', 52428800, 'ready');
```

2. **Wait for playback verification (or trigger manually):**
```bash
curl -X POST http://localhost:3000/api/v1/recording/{CAMERA_ID}/verify
```

3. **Check playback verification log:**
```bash
curl http://localhost:3000/api/v1/recording/playback-verification-history?cameraId={CAMERA_ID}
```

4. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "cameraId": "uuid",
        "segmentId": "uuid",
        "verifiedAt": "2025-01-26T10:00:00Z",
        "success": true,
        "filePath": "/recordings/test.mp4",
        "fileSizeBytes": 52428800,
        "verificationDurationMs": 150
      }
    ],
    "summary": {
      "totalVerifications": 1,
      "successfulVerifications": 1,
      "successRate": 100.0
    }
  }
}
```

#### Test Failure Scenario:
```sql
-- Create segment with missing file
INSERT INTO recording_segments 
  (camera_id, started_at, ended_at, file_path, file_size_bytes, status)
VALUES 
  ('camera-uuid', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '55 minutes', 
   NULL, 0, 'ready');
```

Expected: `success: false`, `errorMessage: "Segment file missing or empty"`

#### Success Criteria:
- ✅ Playback verification runs
- ✅ Valid files pass verification
- ✅ Missing files fail verification
- ✅ Empty files fail verification
- ✅ Verification results logged

---

### Test 7: Recording Uptime Calculation ✨

**Objective:** Verify uptime calculation is accurate

#### Steps:
1. **Calculate uptime for last 24 hours:**
```bash
curl "http://localhost:3000/api/v1/recording/{CAMERA_ID}/uptime?\
startTime=2025-01-26T00:00:00Z&\
endTime=2025-01-27T00:00:00Z"
```

2. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "cameraId": "uuid",
    "startTime": "2025-01-26T00:00:00Z",
    "endTime": "2025-01-27T00:00:00Z",
    "totalDurationSeconds": 86400,
    "recordingDurationSeconds": 85200,
    "gapDurationSeconds": 1200,
    "uptimePercentage": 98.61
  }
}
```

3. **Verify calculation:**
```
Total: 24 hours = 86,400 seconds
Recording: 85,200 seconds
Gaps: 1,200 seconds (20 minutes)
Uptime: 85,200 / 86,400 = 98.61%
```

#### Success Criteria:
- ✅ Uptime calculated correctly
- ✅ Recording duration accurate
- ✅ Gap duration matches detected gaps
- ✅ Percentage formula correct
- ✅ Works for any time range

---

### Test 8: Verification History Tracking ✨

**Objective:** Verify historical tracking is working

#### Steps:
1. **Run multiple verification cycles** (wait 15 minutes for 3 cycles)

2. **Get verification history:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/verification-history?hours=1
```

3. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "timestamp": "2025-01-26T10:35:00Z",
        "status": "recording",
        "healthScore": 100,
        "segmentCompleteness": 100.0,
        "playbackVerified": true
      },
      {
        "timestamp": "2025-01-26T10:30:00Z",
        "status": "recording",
        "healthScore": 98,
        "segmentCompleteness": 98.5,
        "playbackVerified": true
      }
    ],
    "statistics": {
      "totalChecks": 2,
      "avgHealthScore": 99.0,
      "checksWithIssues": 1,
      "avgSegmentCompleteness": 99.25
    }
  }
}
```

#### Success Criteria:
- ✅ History saved to database
- ✅ All verification checks logged
- ✅ Statistics calculated correctly
- ✅ Ordered by most recent first

---

### Test 9: Branch Recording Summary ✨

**Objective:** Verify branch-level aggregation works

#### Steps:
1. **Get branch summary:**
```bash
curl http://localhost:3000/api/v1/recording/branch/{BRANCH_ID}/summary
```

2. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "totalCameras": 20,
    "recordingCameras": 19,
    "camerasWithGaps": 1,
    "camerasWithPlaybackIssues": 0,
    "camerasWithErrors": 0,
    "unhealthyCameras": 1,
    "avgHealthScore": 98.5,
    "avgSegmentCompleteness": 99.2,
    "totalGapSeconds": 300,
    "lastVerifiedAt": "2025-01-26T10:35:00Z"
  }
}
```

3. **Verify aggregation:**
```sql
-- Manually verify counts
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_recording = true) as recording,
  AVG(health_score) as avg_score
FROM camera_recording_status crs
JOIN cameras c ON c.id = crs.camera_id
WHERE c.branch_node_id = 'branch-uuid';
```

#### Success Criteria:
- ✅ Counts accurate
- ✅ Averages calculated correctly
- ✅ Materialized view populated
- ✅ Performance acceptable (<100ms)

---

### Test 10: Alert Generation ✨

**Objective:** Verify automatic alert creation for critical issues

#### Setup:
Create a camera with critical recording issues:
- No recent data (>5 minutes)
- Multiple gaps
- Failed playback

#### Steps:
1. **Trigger verification:**
```bash
curl -X POST http://localhost:3000/api/v1/recording/{CAMERA_ID}/verify
```

2. **Check for alert in database:**
```sql
SELECT 
  alert_type,
  severity,
  title,
  message,
  metadata
FROM operational_alerts
WHERE alert_type = 'recording_failure'
  AND metadata->>'cameraId' = 'camera-uuid'
ORDER BY detected_at DESC
LIMIT 1;
```

3. **Expected Alert:**
```
alert_type: recording_failure
severity: high
title: Recording Issues: Camera 1
message: Camera Camera 1 has critical recording issues: 
         No recording data for 600 seconds; Playback verification failed
```

#### Success Criteria:
- ✅ Alert created automatically
- ✅ Alert severity appropriate (high/critical)
- ✅ Alert message descriptive
- ✅ Metadata includes camera ID and issues
- ✅ Only one alert per issue (no duplicates)

---

### Test 11: Gap Resolution ✨

**Objective:** Verify gap resolution workflow

#### Steps:
1. **Get unresolved gaps:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/gaps
```

2. **Mark gap as resolved:**
```bash
curl -X POST http://localhost:3000/api/v1/recording/gaps/{GAP_ID}/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolutionNotes": "Network issue fixed, recording resumed"
  }'
```

3. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "resolvedAt": "2025-01-26T11:00:00Z",
    "resolutionNotes": "Network issue fixed, recording resumed"
  },
  "message": "Gap marked as resolved"
}
```

4. **Verify gap no longer in unresolved list:**
```bash
curl http://localhost:3000/api/v1/recording/{CAMERA_ID}/gaps
```

#### Success Criteria:
- ✅ Gap marked as resolved
- ✅ Resolved timestamp set
- ✅ Resolution notes saved
- ✅ Gap no longer appears in unresolved queries

---

### Test 12: Overall Statistics ✨

**Objective:** Verify system-wide statistics are accurate

#### Steps:
1. **Get overall recording stats:**
```bash
curl http://localhost:3000/api/v1/recording/stats
```

2. **Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalCameras": 100,
    "recordingCameras": 95,
    "camerasWithGaps": 3,
    "camerasWithPlaybackIssues": 1,
    "avgHealthScore": 97.5,
    "totalGapSeconds": 1800
  }
}
```

3. **Verify against database:**
```sql
SELECT 
  COUNT(*) as total_cameras,
  COUNT(*) FILTER (WHERE is_recording = true) as recording_cameras,
  AVG(health_score) as avg_health_score
FROM camera_recording_status;
```

#### Success Criteria:
- ✅ Counts accurate
- ✅ Averages correct
- ✅ Performance acceptable (<200ms)
- ✅ Real-time (not cached)

---

## Performance Testing

### Test 13: Load Testing ✨

**Objective:** Verify performance with many cameras

#### Scenarios:

**Small Load (50 cameras):**
- Expected verification cycle time: < 30 seconds
- Expected CPU usage: < 2%
- Expected memory usage: < 100MB

**Medium Load (500 cameras):**
- Expected verification cycle time: < 3 minutes
- Expected CPU usage: < 5%
- Expected memory usage: < 500MB

**Large Load (1,000 cameras):**
- Expected verification cycle time: < 5 minutes
- Expected CPU usage: < 5%
- Expected memory usage: < 1GB

#### Steps:
1. **Create test cameras in database**
2. **Populate with test segments**
3. **Start verification service**
4. **Monitor performance metrics:**
   - CPU usage: `top` or `htop`
   - Memory usage: `ps aux | grep node`
   - Database connections: `SELECT * FROM pg_stat_activity`
   - Query times: Enable slow query log

#### Success Criteria:
- ✅ Verification completes within target time
- ✅ CPU usage within limits
- ✅ Memory usage stable (no leaks)
- ✅ Database performance acceptable
- ✅ No errors or timeouts

---

### Test 14: Endurance Testing ✨

**Objective:** Verify continuous operation over 24 hours

#### Steps:
1. **Start verification service**
2. **Monitor for 24 hours:**
   - Service remains running
   - No memory leaks
   - No connection pool exhaustion
   - No database deadlocks
   - Verification cycles complete consistently

3. **Check verification log:**
```sql
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as verification_count,
  AVG(health_score) as avg_health_score
FROM recording_verification_log
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

#### Success Criteria:
- ✅ Service runs continuously without restarts
- ✅ Memory usage stable over time
- ✅ All verification cycles complete
- ✅ No performance degradation
- ✅ Database size growth predictable

---

## Database Testing

### Test 15: Index Performance ✨

**Objective:** Verify database indexes are effective

#### Steps:
1. **Explain analyze key queries:**
```sql
EXPLAIN ANALYZE
SELECT * FROM camera_recording_status
WHERE health_score < 70;

EXPLAIN ANALYZE
SELECT * FROM recording_verification_log
WHERE camera_id = 'uuid'
  AND timestamp >= NOW() - INTERVAL '24 hours';

EXPLAIN ANALYZE
SELECT * FROM recording_gaps
WHERE camera_id = 'uuid'
  AND resolved_at IS NULL;
```

2. **Check index usage:**
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'camera_recording_status',
    'recording_verification_log',
    'recording_gaps'
  )
ORDER BY idx_scan DESC;
```

#### Success Criteria:
- ✅ All queries use indexes (no Seq Scan)
- ✅ Query execution time < 100ms
- ✅ Indexes being utilized (idx_scan > 0)
- ✅ No missing indexes identified

---

### Test 16: Materialized View Refresh ✨

**Objective:** Verify materialized view refresh works correctly

#### Steps:
1. **Manual refresh:**
```bash
curl -X POST http://localhost:3000/api/v1/recording/refresh-summary
```

2. **Verify refresh time:**
```sql
SELECT 
  schemaname,
  matviewname,
  last_refresh
FROM pg_matviews
WHERE matviewname = 'recording_health_summary';
```

3. **Check data consistency:**
```sql
-- Compare materialized view with live data
SELECT * FROM recording_health_summary
WHERE branch_id = 'branch-uuid';

-- vs actual calculation
SELECT 
  COUNT(*) as total_cameras,
  COUNT(*) FILTER (WHERE crs.is_recording = true) as recording_cameras,
  AVG(crs.health_score) as avg_health_score
FROM cameras c
JOIN camera_recording_status crs ON crs.camera_id = c.id
WHERE c.branch_node_id = 'branch-uuid';
```

#### Success Criteria:
- ✅ Refresh completes successfully
- ✅ last_refresh timestamp updated
- ✅ Data matches live calculations
- ✅ Refresh time acceptable (< 5 seconds for 1,000 cameras)

---

## Test Completion Checklist

- [ ] Service initialization (Test 1)
- [ ] Camera status verification (Test 2)
- [ ] Gap detection (Test 3)
- [ ] Segment completeness (Test 4)
- [ ] Health score calculation (Test 5)
- [ ] Playback verification (Test 6)
- [ ] Uptime calculation (Test 7)
- [ ] Verification history (Test 8)
- [ ] Branch summary (Test 9)
- [ ] Alert generation (Test 10)
- [ ] Gap resolution (Test 11)
- [ ] Overall statistics (Test 12)
- [ ] Load testing (Test 13)
- [ ] Endurance testing (Test 14)
- [ ] Index performance (Test 15)
- [ ] Materialized view refresh (Test 16)
- [ ] No TypeScript errors
- [ ] No runtime errors in logs
- [ ] All API endpoints responding
- [ ] Database queries performant

---

## Known Issues and Workarounds

### Issue: FFmpeg Not Installed
**Symptom:** Playback verification fails with "FFmpeg not found"

**Workaround:**
```bash
# Install FFmpeg
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Issue: Materialized View Not Refreshing
**Symptom:** Branch summary shows stale data

**Workaround:**
```sql
-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY recording_health_summary;

-- Or via API
curl -X POST http://localhost:3000/api/v1/recording/refresh-summary
```

### Issue: High Memory Usage
**Symptom:** Service uses excessive memory

**Workaround:**
- Reduce batch size in config (default: 20)
- Increase check interval (default: 300s)
- Enable memory profiling to identify leaks

---

## Next Steps After Testing

1. **Document Issues** - Create tickets for any bugs found
2. **Tune Thresholds** - Adjust based on false positive rates
3. **Optimize Performance** - Address any slow queries or bottlenecks
4. **Pilot Deployment** - Deploy to 1 branch for real-world testing
5. **Monitor Production** - Set up alerts and dashboards

---

**Testing Guide Version:** 1.0  
**Last Updated:** January 26, 2025  
**Status:** Ready for Testing
