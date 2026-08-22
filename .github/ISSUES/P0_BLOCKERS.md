# P0 Production Blockers
**Created:** 2026-08-09  
**Target:** Before any production deployment

## 🚨 Critical - Must Fix Before Production

### 1. AI Confidence Score Integrity ⚠️ CRITICAL
**Impact:** Control room operators receiving false confidence data

**Problem:** 4 files manufacturing fake confidence scores when models unavailable.

**Files:**
```typescript
// ❌ analytics-engine/src/detectors/helmet-detector.ts:184
confidence = 0.5  // when uncertain

// ❌ backend/src/services/tamper-detection.service.ts:454
let confidence = 0.5;  // base confidence for tamper intent

// ❌ root-cause-analysis-engine/src/analyzer/root-cause-analyzer.ts:177
let confidence = 0.5; // Base confidence

// ❌ src/services/ai-incident-summary.ts:517
let confidence = 0.5; // Base confidence for correlation
```

**Required Fix:**
```typescript
interface AIDetectionResult {
  status: 'SUCCESS' | 'MODEL_UNAVAILABLE' | 'INFERENCE_FAILED';
  confidence: number | null;
  model?: string;
  modelVersion?: string;
  inferenceEngine?: string;
  inferenceTimeMs?: number;
  frameTimestamp?: string;
  error?: string;
}

// ✅ CORRECT
if (!this.modelLoaded) {
  return {
    status: 'MODEL_UNAVAILABLE',
    confidence: null,
    error: 'Helmet detection model not loaded'
  };
}

// ✅ CORRECT - from actual model
return {
  status: 'SUCCESS',
  confidence: modelOutput.confidence,
  model: 'yolov8-helmet-v2',
  modelVersion: '2.1.0',
  inferenceEngine: 'onnxruntime',
  inferenceTimeMs: 45,
  frameTimestamp: frame.timestamp
};
```

**Acceptance Criteria:**
- [ ] All 4 files return `null` confidence when model unavailable
- [ ] All AI results include model metadata
- [ ] Dashboard shows "Model Unavailable" not fake confidence
- [ ] Unit tests verify no confidence manufacturing

**Effort:** 8 hours  
**Risk if not fixed:** Operators make decisions on false AI confidence

---

### 2. SMB/CIFS Storage Adapter ⚠️ CRITICAL
**Impact:** Banking/enterprise deployments blocked (SMB is required storage)

**Current State:**
```typescript
// recording-engine/src/storage/smb-adapter.ts

// ❌ NOT IMPLEMENTED:
- getMetrics() - returns hardcoded values
- writeProbe() - throws "not implemented yet"
- stageRecording() - throws "not implemented yet"
- resolvePath() - basic implementation only
- deleteRecording() - throws "not implemented yet"
```

**Required Implementation:**
```typescript
import { SmbClient } from '@azure/storage-file-share';

class SMBStorageAdapter implements StorageAdapter {
  private client: SmbClient;
  
  async getMetrics(): Promise<StorageMetrics> {
    // Query actual SMB share capacity
    const stats = await this.client.getProperties();
    return {
      totalBytes: stats.quota * 1024 * 1024,
      usedBytes: stats.usageBytes,
      availableBytes: stats.quota * 1024 * 1024 - stats.usageBytes,
      path: this.config.path
    };
  }
  
  async writeProbe(): Promise<void> {
    // Write + read-back verification
    const probe = `probe-${Date.now()}.txt`;
    await this.client.upload(probe, Buffer.from('test'));
    const content = await this.client.download(probe);
    await this.client.delete(probe);
    if (content.toString() !== 'test') {
      throw new Error('SMB write probe failed');
    }
  }
  
  async stageRecording(params: StageParams): Promise<StagedRecording> {
    // Multi-part staging for large recordings
    const tempPath = `${this.config.stagingDir}/${params.recordingId}.tmp`;
    const stream = this.client.createWriteStream(tempPath);
    
    return {
      recordingId: params.recordingId,
      write: (chunk) => stream.write(chunk),
      commit: async () => {
        stream.end();
        const finalPath = this.resolvePath(params);
        await this.client.rename(tempPath, finalPath);
        
        // Verify
        const stats = await this.client.stat(finalPath);
        return {
          path: finalPath,
          sizeBytes: stats.size,
          checksum: await this.calculateChecksum(finalPath)
        };
      },
      abort: () => this.client.delete(tempPath)
    };
  }
}
```

**Dependencies:**
- SMB client library (samba-client or @azure/storage-file-share)
- Authentication (domain/workgroup credentials)
- Connection pooling
- Error handling for network issues

**Acceptance Criteria:**
- [ ] Real metrics from SMB share
- [ ] Write probe with verification
- [ ] Multi-part staging for large files
- [ ] Proper error handling
- [ ] Connection recovery on network failure
- [ ] Unit tests with SMB mock
- [ ] Integration test with real SMB share

**Effort:** 40 hours  
**Risk if not fixed:** Cannot deploy to enterprise banking clients

---

### 3. S3 Storage Metrics (Fake 5PB Capacity) ⚠️ CRITICAL
**Impact:** Operators see misleading storage capacity on dashboard

**Current Code:**
```typescript
// recording-engine/src/storage/s3-adapter.ts
async getMetrics(): Promise<StorageMetrics> {
  // ❌ FAKE CAPACITY
  return {
    totalBytes: 5 * 1024 * 1024 * 1024 * 1024 * 1024, // 5 PB "virtual"
    usedBytes: estimatedUsage,  // from sampling
    availableBytes: 5 * 1024 * 1024 * 1024 * 1024 * 1024 - estimatedUsage
  };
}
```

**Required Implementation:**
```typescript
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { S3Client, GetBucketLocationCommand } from '@aws-sdk/client-s3';

async getMetrics(): Promise<S3StorageMetrics> {
  const cloudwatch = new CloudWatchClient({ region: this.config.region });
  
  // Get actual S3 metrics from CloudWatch
  const [sizeMetric, objectCountMetric] = await Promise.all([
    cloudwatch.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/S3',
      MetricName: 'BucketSizeBytes',
      Dimensions: [
        { Name: 'BucketName', Value: this.config.bucket },
        { Name: 'StorageType', Value: 'StandardStorage' }
      ],
      StartTime: new Date(Date.now() - 86400000), // 24h ago
      EndTime: new Date(),
      Period: 86400,
      Statistics: ['Average']
    })),
    cloudwatch.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/S3',
      MetricName: 'NumberOfObjects',
      Dimensions: [
        { Name: 'BucketName', Value: this.config.bucket },
        { Name: 'StorageType', Value: 'AllStorageTypes' }
      ],
      StartTime: new Date(Date.now() - 86400000),
      EndTime: new Date(),
      Period: 86400,
      Statistics: ['Average']
    }))
  ]);
  
  const usedBytes = sizeMetric.Datapoints?.[0]?.Average ?? 0;
  const objectCount = objectCountMetric.Datapoints?.[0]?.Average ?? 0;
  
  // Get lifecycle status
  const lifecycleStats = await this.getLifecycleStats();
  
  // Check for failed multipart uploads
  const failedUploads = await this.getFailedMultipartUploads();
  
  return {
    type: 's3',
    bucket: this.config.bucket,
    region: this.config.region,
    
    // Storage by tier
    hot: {
      sizeBytes: usedBytes,
      objectCount: objectCount,
      storageClass: 'STANDARD'
    },
    warm: {
      sizeBytes: lifecycleStats.intelligentTiering,
      objectCount: lifecycleStats.intelligentTieringCount,
      storageClass: 'INTELLIGENT_TIERING'
    },
    cold: {
      sizeBytes: lifecycleStats.glacier,
      objectCount: lifecycleStats.glacierCount,
      storageClass: 'GLACIER'
    },
    
    // Upload status
    pending: {
      sizeBytes: failedUploads.pendingBytes,
      uploadCount: failedUploads.pendingCount
    },
    failed: {
      sizeBytes: failedUploads.failedBytes,
      uploadCount: failedUploads.failedCount,
      oldestFailure: failedUploads.oldestFailure
    },
    
    // Retention
    retentionDays: this.config.retentionDays,
    oldestRecording: await this.getOldestRecordingDate(),
    
    // ✅ NO FAKE CAPACITY
    // S3 is "unlimited" - report actual usage only
    totalBytes: null,
    availableBytes: null,
    capacityType: 'unlimited'
  };
}
```

**Dashboard Display:**
```typescript
// ✅ CORRECT
Recording Storage (S3)
──────────────────────────────
Hot (Standard):        28.4 TB  (2.1M recordings)
Warm (Intelligent):    94.2 TB  (6.8M recordings)
Cold (Glacier):       421.7 TB  (29.3M recordings)
Pending uploads:        1.2 TB  (84 uploads)
Failed uploads:       183 GB    (12 uploads) ⚠️
─────────────────────────────
Total:                545.7 TB
Retention:            184 days
Oldest recording:     2025-02-08

// ❌ WRONG
Storage: 545.7 TB / 5 PB (10.9%)  ← FAKE CAPACITY
```

**Acceptance Criteria:**
- [ ] Real CloudWatch metrics integration
- [ ] Storage class breakdown (Standard/IA/Glacier)
- [ ] Failed multipart upload tracking
- [ ] Lifecycle policy status
- [ ] NO fake capacity numbers
- [ ] Dashboard shows "unlimited" correctly
- [ ] Alerts on failed uploads

**Effort:** 16 hours  
**Risk if not fixed:** Operators make wrong storage decisions

---

### 4. Storage Failover Testing ⚠️ CRITICAL
**Impact:** Unknown behavior when primary storage fails

**Current State:** ⚫ **NOT TESTED**

**Required Test Scenarios:**

#### Scenario A: Primary Disk Full
```typescript
describe('Storage Failover - Disk Full', () => {
  it('should fail over to secondary storage when primary full', async () => {
    // Fill primary to 100%
    await fillStorage(primaryDisk, '100%');
    
    // Attempt recording
    const result = await recordingEngine.startRecording({
      cameraId: 'cam-001',
      duration: 300
    });
    
    // ✅ Should succeed on secondary
    expect(result.status).toBe('SUCCESS');
    expect(result.storagePath).toContain(secondaryDisk);
    
    // ✅ Should create incident
    const incident = await getLatestIncident();
    expect(incident.type).toBe('STORAGE_FAILOVER');
    expect(incident.severity).toBe('CRITICAL');
    
    // ✅ Should alert operator
    const alert = await getLatestAlert();
    expect(alert.message).toContain('Primary storage full');
  });
});
```

#### Scenario B: S3 Unavailable
```typescript
it('should fail over when S3 unavailable', async () => {
  // Simulate S3 outage
  await simulateS3Outage();
  
  // Attempt recording
  const result = await recordingEngine.startRecording({
    cameraId: 'cam-002'
  });
  
  // ✅ Should record to local staging
  expect(result.status).toBe('SUCCESS');
  expect(result.storagePath).toContain('/staging/');
  expect(result.uploadStatus).toBe('PENDING_RETRY');
  
  // ✅ Should queue for later upload
  const queue = await getUploadQueue();
  expect(queue.length).toBeGreaterThan(0);
  
  // Restore S3
  await restoreS3();
  
  // ✅ Should auto-retry upload
  await wait(5000);
  const uploaded = await verifyS3Upload(result.recordingId);
  expect(uploaded).toBe(true);
});
```

#### Scenario C: SMB Network Failure
```typescript
it('should handle SMB network failure gracefully', async () => {
  // Start recording to SMB
  const recording = await recordingEngine.startRecording({
    cameraId: 'cam-003',
    storage: 'smb'
  });
  
  // Simulate network failure mid-recording
  await simulateNetworkFailure('smb-server');
  
  // ✅ Should NOT lose recording
  expect(recording.status).toBe('FAILOVER');
  expect(recording.segments).toHaveLength(1); // partial segment saved
  
  // ✅ Should switch to local
  await wait(2000);
  expect(recording.currentStorage).toBe('local');
  
  // Restore network
  await restoreNetwork('smb-server');
  
  // ✅ Should resume to SMB
  await wait(5000);
  expect(recording.currentStorage).toBe('smb');
});
```

**Acceptance Criteria:**
- [ ] All 3 scenarios pass
- [ ] No recording data loss
- [ ] Incidents created automatically
- [ ] Operators alerted in real-time
- [ ] Auto-recovery when storage returns
- [ ] Metrics track failover events

**Effort:** 24 hours  
**Risk if not fixed:** Recording loss during storage failures

---

### 5. Crowd Density Model Implementation ⚠️ CRITICAL
**Impact:** Feature advertised but not implemented

**Current Code:**
```typescript
// analytics-engine/src/detectors/crowd-density-detector.ts:44

// ❌ TODO: Load person detection + counting model
// Can use standard person detector + density estimation networks

this.isModelLoaded = true;  // ← FAKE
```

**Required Implementation:**

**Option A:** Person counting approach
```typescript
import { YoloPersonInference } from '../inference/yolo-person-inference';

async initialize(): Promise<void> {
  // Load person detection
  this.personDetector = await YoloPersonInference.load({
    modelPath: './models/yolov8-person.onnx',
    confidence: 0.6
  });
  
  // Load density estimation (CSRNet or similar)
  this.densityEstimator = await loadONNXModel({
    modelPath: './models/csrnet-density.onnx'
  });
  
  this.isModelLoaded = true;
}

async detect(frame: DetectionFrame): Promise<CrowdDensityEvent[]> {
  if (!this.isModelLoaded) {
    return [{
      status: 'MODEL_UNAVAILABLE',
      confidence: null,
      error: 'Crowd density model not loaded'
    }];
  }
  
  // Detect persons
  const persons = await this.personDetector.infer(frame);
  const personCount = persons.length;
  
  // Estimate density heatmap
  const densityMap = await this.densityEstimator.infer(frame);
  const averageDensity = this.calculateAverageDensity(densityMap);
  
  return [{
    type: 'CROWD_DENSITY',
    timestamp: frame.timestamp,
    cameraId: frame.cameraId,
    personCount: personCount,
    density: averageDensity,
    densityLevel: this.classifyDensity(averageDensity),
    confidence: Math.min(persons[0]?.confidence ?? 0, 0.95),
    model: 'csrnet-v1',
    modelVersion: '1.0.0'
  }];
}
```

**Option B:** Lightweight counting only
```typescript
async detect(frame: DetectionFrame): Promise<CrowdDensityEvent[]> {
  // Use existing person detector
  const persons = await this.getPersons(frame);
  
  if (persons.length === 0) {
    return [];
  }
  
  // Calculate density from person bounding boxes
  const frameArea = frame.width * frame.height;
  const occupiedArea = persons.reduce((sum, p) => 
    sum + (p.bbox.width * p.bbox.height), 0
  );
  const density = occupiedArea / frameArea;
  
  return [{
    type: 'CROWD_DENSITY',
    timestamp: frame.timestamp,
    cameraId: frame.cameraId,
    personCount: persons.length,
    density: density,
    densityLevel: this.classifyDensity(density),
    confidence: Math.min(...persons.map(p => p.confidence)),
    model: 'person-density-estimation',
    modelVersion: '1.0.0',
    method: 'bbox_counting'
  }];
}
```

**Acceptance Criteria:**
- [ ] Model actually loaded (no fake `isModelLoaded`)
- [ ] Returns `MODEL_UNAVAILABLE` when not loaded
- [ ] Real confidence from model inference
- [ ] Density calculation documented
- [ ] Accuracy tested on benchmark dataset
- [ ] Performance: <100ms inference time

**Effort:** 32 hours (Option A) or 16 hours (Option B)  
**Risk if not fixed:** Feature advertised but doesn't work

---

## Summary

| Blocker | Effort | Impact | Deadline |
|---------|--------|--------|----------|
| AI Confidence Integrity | 8h | Control room safety | Week 1 |
| SMB Adapter | 40h | Enterprise deployment | Week 3 |
| S3 Metrics | 16h | Operator decisions | Week 2 |
| Storage Failover Testing | 24h | Recording reliability | Week 3 |
| Crowd Density Model | 16-32h | Feature honesty | Week 4 |

**Total Effort:** 104-120 hours (3-4 weeks with 1 engineer)

**Recommendation:** Fix AI confidence integrity FIRST (Week 1).  
That's the highest risk issue for operator safety.

---

**Next Steps:**
1. Create GitHub issues for each blocker
2. Assign owners
3. Set weekly review meetings
4. Update PRODUCTION_TRUTH.md after each fix
5. Run acceptance tests before marking "DONE"
