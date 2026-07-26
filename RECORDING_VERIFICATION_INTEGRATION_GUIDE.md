# Recording Verification - Integration Guide

**Purpose:** Guide for integrating the Recording Verification system into your application  
**Audience:** Backend and Frontend Developers  
**Date:** January 26, 2025

---

## Overview

The Recording Verification system provides continuous monitoring of camera recording health, including:
- Recording continuity verification
- Gap detection
- Playback integrity checks
- Health scoring (0-100)
- Comprehensive API endpoints

---

## Backend Integration

### Step 1: Apply Database Migration

```bash
# Navigate to backend directory
cd backend

# Apply the migration
psql -U postgres -d your_database -f prisma/migrations/20260726_recording_verification.sql

# Verify tables created
psql -U postgres -d your_database -c "\dt recording_*"

# Expected output:
# recording_gaps
# recording_health_summary (materialized view)
# recording_verification_log
# camera_recording_status
# playback_verification_log
# dvr_recording_validation_log
```

**Verify Functions:**
```sql
SELECT proname FROM pg_proc 
WHERE proname LIKE '%recording%';

-- Expected:
-- refresh_recording_health_summary
-- auto_resolve_old_gaps
-- calculate_recording_uptime
```

---

### Step 2: Initialize the Service

**In your main app.ts or index.ts:**

```typescript
import { getRecordingVerificationService } from './services/recording-verification.service.js';
import { Pool } from 'pg';

// Initialize database pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Initialize recording verification service
const verificationService = getRecordingVerificationService(pool);

// Configure service (optional)
const customConfig = {
  checkInterval: 300,               // 5 minutes (default)
  gapThreshold: 120,                // 2 minutes (default)
  playbackVerificationInterval: 3600, // 1 hour (default)
  segmentInterval: 300,             // 5-minute segments (default)
  minHealthScore: 70,              // Minimum acceptable score
  enablePlaybackVerification: true,
  enableDvrCrossValidation: false, // Future feature
};

// Start the service
await verificationService.start();

console.log('Recording verification service started');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Stopping recording verification service...');
  await verificationService.stop();
  await pool.end();
  process.exit(0);
});
```

---

### Step 3: Register API Routes

**In your routes/index.ts:**

```typescript
import { createRecordingVerificationRouter } from './routes/recording-verification-api.js';
import { getRecordingVerificationService } from './services/recording-verification.service.js';

// Get service instance
const verificationService = getRecordingVerificationService(pool);

// Create router
const recordingVerificationRouter = createRecordingVerificationRouter(
  pool,
  verificationService
);

// Register routes
app.use('/api/v1/recording', recordingVerificationRouter);

console.log('Recording verification routes registered');
```

---

### Step 4: Configure Environment Variables

**Add to your .env file:**

```env
# Recording Verification Configuration
RECORDING_VERIFICATION_ENABLED=true
RECORDING_CHECK_INTERVAL=300
RECORDING_GAP_THRESHOLD=120
RECORDING_PLAYBACK_VERIFICATION_INTERVAL=3600
RECORDING_SEGMENT_INTERVAL=300
RECORDING_MIN_HEALTH_SCORE=70
RECORDING_ENABLE_PLAYBACK_VERIFICATION=true
RECORDING_ENABLE_DVR_VALIDATION=false
```

**Load in config:**

```typescript
const verificationConfig = {
  checkInterval: parseInt(process.env.RECORDING_CHECK_INTERVAL || '300'),
  gapThreshold: parseInt(process.env.RECORDING_GAP_THRESHOLD || '120'),
  playbackVerificationInterval: parseInt(
    process.env.RECORDING_PLAYBACK_VERIFICATION_INTERVAL || '3600'
  ),
  segmentInterval: parseInt(process.env.RECORDING_SEGMENT_INTERVAL || '300'),
  minHealthScore: parseInt(process.env.RECORDING_MIN_HEALTH_SCORE || '70'),
  enablePlaybackVerification: 
    process.env.RECORDING_ENABLE_PLAYBACK_VERIFICATION === 'true',
  enableDvrCrossValidation: 
    process.env.RECORDING_ENABLE_DVR_VALIDATION === 'true',
};
```

---

### Step 5: Add Health Check Endpoint

**For monitoring tools (Kubernetes, Docker, etc.):**

```typescript
app.get('/health/recording-verification', async (req, res) => {
  try {
    const stats = verificationService.getRecordingStats();
    
    // Check if service is healthy
    const isHealthy = 
      stats.avgHealthScore > 70 &&
      stats.camerasWithPlaybackIssues === 0;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
    });
  }
});
```

---

### Step 6: Schedule Materialized View Refresh

**Option A: Using node-cron:**

```typescript
import cron from 'node-cron';

// Refresh every hour
cron.schedule('0 * * * *', async () => {
  try {
    await pool.query('SELECT refresh_recording_health_summary()');
    console.log('Recording health summary refreshed');
  } catch (error) {
    console.error('Failed to refresh recording health summary:', error);
  }
});

// Auto-resolve old gaps daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  try {
    const result = await pool.query('SELECT auto_resolve_old_gaps()');
    console.log(`Resolved ${result.rows[0].auto_resolve_old_gaps} old gaps`);
  } catch (error) {
    console.error('Failed to auto-resolve gaps:', error);
  }
});
```

**Option B: Using PostgreSQL pg_cron:**

```sql
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly refresh
SELECT cron.schedule(
  'refresh-recording-health-summary',
  '0 * * * *',  -- Every hour
  $$SELECT refresh_recording_health_summary()$$
);

-- Schedule daily gap cleanup
SELECT cron.schedule(
  'auto-resolve-old-gaps',
  '0 2 * * *',  -- Daily at 2 AM
  $$SELECT auto_resolve_old_gaps()$$
);
```

---

## Frontend Integration

### Step 1: Create API Client

**lib/api/recording-verification.ts:**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export interface CameraRecordingStatus {
  cameraId: string;
  cameraName: string;
  status: 'recording' | 'idle' | 'error' | 'disabled' | 'gap_detected' | 'playback_failed';
  isRecording: boolean;
  expectedRecording: boolean;
  lastSegmentTime?: string;
  lastVerifiedTime?: string;
  recordingGapSeconds?: number;
  segmentCount24h: number;
  expectedSegmentCount24h: number;
  segmentCompleteness: number;
  playbackVerified: boolean;
  consecutiveFailures: number;
  healthScore: number;
  issues: RecordingIssue[];
}

export interface RecordingIssue {
  type: 'gap' | 'missing_segments' | 'playback_failed' | 'dvr_mismatch' | 'retention_violation' | 'no_recent_data';
  severity: 'info' | 'warning' | 'critical';
  detectedAt: string;
  description: string;
  gapDurationSeconds?: number;
  missingSegmentCount?: number;
}

export interface RecordingGap {
  id: string;
  cameraId: string;
  gapStart: string;
  gapEnd: string;
  durationSeconds: number;
  expectedSegments: number;
  actualSegments: number;
  reason?: string;
  detectedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

/**
 * Get recording status for a camera
 */
export async function getCameraRecordingStatus(
  cameraId: string
): Promise<CameraRecordingStatus> {
  const response = await fetch(`${API_BASE}/recording/${cameraId}/status`);
  if (!response.ok) throw new Error('Failed to fetch recording status');
  const data = await response.json();
  return data.data;
}

/**
 * Get recording gaps for a camera
 */
export async function getCameraRecordingGaps(
  cameraId: string,
  hours: number = 24
): Promise<{ gaps: RecordingGap[]; summary: any }> {
  const response = await fetch(
    `${API_BASE}/recording/${cameraId}/gaps?hours=${hours}`
  );
  if (!response.ok) throw new Error('Failed to fetch recording gaps');
  const data = await response.json();
  return data.data;
}

/**
 * Get recording uptime
 */
export async function getCameraRecordingUptime(
  cameraId: string,
  startTime: string,
  endTime?: string
): Promise<{
  totalDurationSeconds: number;
  recordingDurationSeconds: number;
  gapDurationSeconds: number;
  uptimePercentage: number;
}> {
  const params = new URLSearchParams({ startTime });
  if (endTime) params.append('endTime', endTime);
  
  const response = await fetch(
    `${API_BASE}/recording/${cameraId}/uptime?${params}`
  );
  if (!response.ok) throw new Error('Failed to fetch recording uptime');
  const data = await response.json();
  return data.data;
}

/**
 * Trigger manual verification
 */
export async function triggerRecordingVerification(
  cameraId: string
): Promise<CameraRecordingStatus> {
  const response = await fetch(
    `${API_BASE}/recording/${cameraId}/verify`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error('Failed to trigger verification');
  const data = await response.json();
  return data.data;
}

/**
 * Get branch recording summary
 */
export async function getBranchRecordingSummary(branchId: string) {
  const response = await fetch(
    `${API_BASE}/recording/branch/${branchId}/summary`
  );
  if (!response.ok) throw new Error('Failed to fetch branch summary');
  const data = await response.json();
  return data.data;
}

/**
 * Get overall recording stats
 */
export async function getRecordingStats() {
  const response = await fetch(`${API_BASE}/recording/stats`);
  if (!response.ok) throw new Error('Failed to fetch recording stats');
  const data = await response.json();
  return data.data;
}

/**
 * Resolve a recording gap
 */
export async function resolveRecordingGap(
  gapId: string,
  resolutionNotes: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/recording/gaps/${gapId}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNotes }),
    }
  );
  if (!response.ok) throw new Error('Failed to resolve gap');
}
```

---

### Step 2: Create React Hook

**hooks/useRecordingStatus.ts:**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCameraRecordingStatus,
  getCameraRecordingGaps,
  getCameraRecordingUptime,
  triggerRecordingVerification,
  resolveRecordingGap,
} from '../lib/api/recording-verification';

/**
 * Hook for camera recording status
 */
export function useCameraRecordingStatus(cameraId: string) {
  return useQuery({
    queryKey: ['camera-recording-status', cameraId],
    queryFn: () => getCameraRecordingStatus(cameraId),
    refetchInterval: 60000, // Refresh every minute
    enabled: !!cameraId,
  });
}

/**
 * Hook for camera recording gaps
 */
export function useCameraRecordingGaps(cameraId: string, hours: number = 24) {
  return useQuery({
    queryKey: ['camera-recording-gaps', cameraId, hours],
    queryFn: () => getCameraRecordingGaps(cameraId, hours),
    enabled: !!cameraId,
  });
}

/**
 * Hook for camera recording uptime
 */
export function useCameraRecordingUptime(
  cameraId: string,
  startTime: string,
  endTime?: string
) {
  return useQuery({
    queryKey: ['camera-recording-uptime', cameraId, startTime, endTime],
    queryFn: () => getCameraRecordingUptime(cameraId, startTime, endTime),
    enabled: !!cameraId && !!startTime,
  });
}

/**
 * Hook for manual verification trigger
 */
export function useRecordingVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerRecordingVerification,
    onSuccess: (data, cameraId) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['camera-recording-status', cameraId],
      });
      queryClient.invalidateQueries({
        queryKey: ['camera-recording-gaps', cameraId],
      });
    },
  });
}

/**
 * Hook for gap resolution
 */
export function useGapResolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gapId, resolutionNotes }: { 
      gapId: string; 
      resolutionNotes: string 
    }) => resolveRecordingGap(gapId, resolutionNotes),
    onSuccess: () => {
      // Invalidate gap queries
      queryClient.invalidateQueries({
        queryKey: ['camera-recording-gaps'],
      });
    },
  });
}
```

---

### Step 3: Create UI Components

**components/RecordingHealthBadge.tsx:**

```typescript
import React from 'react';
import { CameraRecordingStatus } from '../lib/api/recording-verification';

interface Props {
  status: CameraRecordingStatus;
}

export function RecordingHealthBadge({ status }: Props) {
  const getColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 text-green-800';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800';
    if (score >= 50) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getStatusIcon = (statusType: string) => {
    switch (statusType) {
      case 'recording':
        return '🔴'; // Recording
      case 'gap_detected':
        return '⚠️'; // Warning
      case 'playback_failed':
        return '❌'; // Error
      case 'disabled':
        return '⏸️'; // Paused
      default:
        return '⭕'; // Idle
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-xl">{getStatusIcon(status.status)}</span>
      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getColor(status.healthScore)}`}>
        Health: {status.healthScore}
      </div>
      <div className="text-sm text-gray-600">
        {status.segmentCompleteness.toFixed(1)}% complete
      </div>
    </div>
  );
}
```

**components/RecordingGapsList.tsx:**

```typescript
import React from 'react';
import { RecordingGap } from '../lib/api/recording-verification';
import { formatDuration } from '../lib/utils';

interface Props {
  gaps: RecordingGap[];
  onResolve: (gapId: string, notes: string) => void;
}

export function RecordingGapsList({ gaps, onResolve }: Props) {
  const [resolvingGap, setResolvingGap] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');

  const handleResolve = (gapId: string) => {
    onResolve(gapId, notes);
    setResolvingGap(null);
    setNotes('');
  };

  return (
    <div className="space-y-4">
      {gaps.map((gap) => (
        <div key={gap.id} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-lg font-semibold text-red-600">
                Gap: {formatDuration(gap.durationSeconds)}
              </div>
              <div className="text-sm text-gray-600">
                {new Date(gap.gapStart).toLocaleString()} →{' '}
                {new Date(gap.gapEnd).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Expected {gap.expectedSegments} segments, found {gap.actualSegments}
              </div>
              {gap.reason && (
                <div className="text-sm text-gray-700 mt-1">
                  Reason: {gap.reason}
                </div>
              )}
            </div>
            
            {!gap.resolvedAt ? (
              <button
                onClick={() => setResolvingGap(gap.id)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Resolve
              </button>
            ) : (
              <div className="text-green-600 text-sm">
                ✓ Resolved
              </div>
            )}
          </div>

          {resolvingGap === gap.id && (
            <div className="mt-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Resolution notes..."
                className="w-full px-3 py-2 border rounded"
                rows={3}
              />
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={() => handleResolve(gap.id)}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Submit
                </button>
                <button
                  onClick={() => setResolvingGap(null)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

**pages/CameraRecordingHealth.tsx:**

```typescript
import React from 'react';
import { useCameraRecordingStatus, useCameraRecordingGaps } from '../hooks/useRecordingStatus';
import { RecordingHealthBadge } from '../components/RecordingHealthBadge';
import { RecordingGapsList } from '../components/RecordingGapsList';

interface Props {
  cameraId: string;
}

export function CameraRecordingHealthPage({ cameraId }: Props) {
  const { data: status, isLoading: statusLoading } = useCameraRecordingStatus(cameraId);
  const { data: gapsData, isLoading: gapsLoading } = useCameraRecordingGaps(cameraId, 24);

  if (statusLoading || gapsLoading) {
    return <div>Loading...</div>;
  }

  if (!status) {
    return <div>Camera recording status not available</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{status.cameraName}</h1>
        <p className="text-gray-600">Recording Health Monitoring</p>
      </div>

      {/* Status Badge */}
      <RecordingHealthBadge status={status} />

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Health Score</div>
          <div className="text-2xl font-bold">{status.healthScore}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Segments (24h)</div>
          <div className="text-2xl font-bold">
            {status.segmentCount24h}/{status.expectedSegmentCount24h}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Completeness</div>
          <div className="text-2xl font-bold">
            {status.segmentCompleteness.toFixed(1)}%
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600">Playback Status</div>
          <div className="text-2xl font-bold">
            {status.playbackVerified ? '✓' : '✗'}
          </div>
        </div>
      </div>

      {/* Issues */}
      {status.issues.length > 0 && (
        <div className="border-l-4 border-red-500 bg-red-50 p-4">
          <h3 className="font-semibold text-red-800 mb-2">Issues Detected</h3>
          <ul className="space-y-1">
            {status.issues.map((issue, index) => (
              <li key={index} className="text-sm text-red-700">
                <strong>{issue.type}:</strong> {issue.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recording Gaps */}
      {gapsData && gapsData.gaps.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Recording Gaps</h2>
          <RecordingGapsList 
            gaps={gapsData.gaps}
            onResolve={(gapId, notes) => {
              // Handle gap resolution
              console.log('Resolve gap', gapId, notes);
            }}
          />
        </div>
      )}
    </div>
  );
}
```

---

## WebSocket Integration (Optional)

For real-time updates, you can emit recording status changes via WebSocket:

**Backend:**

```typescript
import { Server as SocketIOServer } from 'socket.io';

// In your verification service, emit events
private async verifyCameraRecording(camera: any): Promise<void> {
  // ... existing verification logic ...

  // Emit status change via WebSocket
  if (previousStatus !== newStatus.status) {
    this.io?.emit('recording:status-change', {
      cameraId: camera.id,
      previousStatus,
      currentStatus: newStatus.status,
      healthScore: newStatus.healthScore,
      issues: newStatus.issues,
    });
  }

  // Emit gap detected
  if (gaps.length > 0) {
    this.io?.emit('recording:gap-detected', {
      cameraId: camera.id,
      gap: gaps[0],
    });
  }
}
```

**Frontend:**

```typescript
import { io } from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_WS_URL);

socket.on('recording:status-change', (data) => {
  console.log('Recording status changed:', data);
  // Update UI, show notification, etc.
});

socket.on('recording:gap-detected', (data) => {
  console.log('Recording gap detected:', data);
  // Show alert, update gap list, etc.
});
```

---

## Monitoring and Alerting

### Prometheus Metrics (Optional)

```typescript
import { register, Counter, Gauge } from 'prom-client';

// Define metrics
const recordingHealthScore = new Gauge({
  name: 'recording_health_score',
  help: 'Current recording health score',
  labelNames: ['camera_id', 'camera_name'],
});

const recordingGapsTotal = new Counter({
  name: 'recording_gaps_total',
  help: 'Total number of recording gaps detected',
  labelNames: ['camera_id', 'severity'],
});

// Update metrics in verification service
private async verifyCameraRecording(camera: any): Promise<void> {
  // ... existing logic ...

  // Update Prometheus metrics
  recordingHealthScore.set(
    { camera_id: camera.id, camera_name: camera.name },
    newStatus.healthScore
  );

  if (gaps.length > 0) {
    recordingGapsTotal.inc({
      camera_id: camera.id,
      severity: gaps[0].durationSeconds > 300 ? 'critical' : 'warning',
    });
  }
}

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Troubleshooting

### Issue: Service Not Starting
```typescript
// Check logs for errors
console.error('Failed to start recording verification:', error);

// Verify database connection
await pool.query('SELECT 1');

// Verify migration applied
await pool.query("SELECT * FROM camera_recording_status LIMIT 1");
```

### Issue: No Gaps Detected
```sql
-- Verify recording segments exist
SELECT COUNT(*) FROM recording_segments WHERE camera_id = 'uuid';

-- Verify gap threshold
-- Gaps < 2 minutes won't be detected by default

-- Manually check for gaps
SELECT 
  ended_at as prev_ended,
  LEAD(started_at) OVER (ORDER BY started_at) as next_started,
  EXTRACT(EPOCH FROM (LEAD(started_at) OVER (ORDER BY started_at) - ended_at)) as gap_seconds
FROM recording_segments
WHERE camera_id = 'uuid'
ORDER BY started_at;
```

### Issue: High Memory Usage
```typescript
// Reduce batch size
const config = {
  batchSize: 10, // Reduce from default 20
  maxConcurrent: 10, // Reduce from default 20
};

// Increase check interval
const config = {
  checkInterval: 600, // 10 minutes instead of 5
};
```

---

## Next Steps

1. Apply database migration ✅
2. Initialize service in backend ✅
3. Register API routes ✅
4. Create frontend components ✅
5. Test with real data ✅
6. Monitor performance ✅
7. Tune thresholds ✅
8. Deploy to production ✅

---

**Integration Guide Version:** 1.0  
**Last Updated:** January 26, 2025  
**Status:** Ready for Integration
