# Video Capacity Management Integration Guide

This guide explains how to integrate the capacity-aware video scheduling system with the enhanced camera grid.

## Architecture Overview

The new system separates three previously conflated concepts:

1. **Grid Capacity**: Number of UI slots (e.g., 12×12 = 144)
2. **Decoder Capacity**: Actual browser video decoders available (e.g., 36)
3. **Session Policy**: Operator/security requirements

Instead of trying to decode all 144 streams simultaneously, the system:
- Renders 144 camera tiles (UI capacity)
- Actively decodes 36 streams (decoder capacity)
- Shows snapshots for the remaining 108 cameras

## Core Components

### 1. ViewerCapacityManager
Detects and manages browser decoder capacity:
- Hardware acceleration detection
- GPU capabilities
- Memory and CPU assessment
- Runtime performance monitoring
- Adaptive capacity adjustment

### 2. StreamScheduler
Priority-based camera selection:
- **P0**: Operator pinned/selected (highest priority)
- **P1**: Critical security alerts
- **P2**: High severity alerts
- **P3**: Active investigations
- **P4**: Visible cameras
- **P5**: Rotation pool
- **P6**: Background

### 3. DecoderPool
Manages video decoder lifecycle:
- Acquire/release decoders
- Upgrade/downgrade streams
- Track playback metrics
- Monitor performance

### 4. SnapshotService
Periodic snapshots for non-decoded cameras:
- Priority-based refresh intervals
- Server-side or client-side extraction
- Bandwidth-efficient monitoring

## Integration with Enhanced Camera Grid

### Option 1: Replace Existing StreamSchedulerProvider

The new system can replace the current `StreamSchedulerProvider` in `enhanced-camera-grid.tsx`:

```tsx
import { useVideoWallScheduler } from "@/hooks/use-video-wall-scheduler";
import { CapacityMonitor } from "@/components/capacity-monitor";

function EnhancedCameraGrid({ cameras, ... }: EnhancedCameraGridProps) {
  const {
    schedule,
    playbackStates,
    capacity,
    budget,
    activeDecoderCount,
    snapshotCount,
  } = useVideoWallScheduler({
    cameras,
    visibleRange,
    gridPositions,
    priorityCameraIds,
    alertCameraIds: cameras.filter(c => c.status === 'alert').map(c => c.id),
    criticalAlertCameraIds: [], // from alert system
    incidentCameraIds: [], // from incident system
    operatorSelectedCameraId: selectedCamera?.id,
    enableSnapshots: true,
    snapshotBaseUrl: '/api/cameras',
  });

  // Use schedule to determine which cameras get live decoders
  return (
    <>
      <CapacityMonitor
        capacity={capacity}
        budget={budget}
        schedule={schedule}
        activeDecoderCount={activeDecoderCount}
        snapshotCount={snapshotCount}
        compact
      />
      
      <div className="camera-grid">
        {cameras.map(camera => {
          const scheduled = schedule.get(camera.id);
          const state = playbackStates.get(camera.id);
          
          return (
            <CameraTile
              camera={camera}
              mode={scheduled?.mode}
              priority={scheduled?.priority}
              decoderAllocated={state?.decoderAllocated}
              {...otherProps}
            />
          );
        })}
      </div>
    </>
  );
}
```

### Option 2: Gradual Migration

Keep existing grid logic but add capacity monitoring:

```tsx
import { getViewerCapacityManager } from "@/lib/video";

// Initialize once
useEffect(() => {
  const capacityManager = getViewerCapacityManager();
  capacityManager.initialize().then(capacity => {
    console.log('Detected capacity:', capacity.recommendedDecoderLimit);
    setDecoderLimit(capacity.recommendedDecoderLimit);
  });
}, []);
```

## Priority-Based Scheduling Example

```tsx
// Alert arrives
const handleCriticalAlert = (cameraId: string) => {
  // Update critical alert list
  setCriticalAlertCameraIds(prev => [...prev, cameraId]);
  
  // Scheduler automatically:
  // 1. Checks if emergency decoder slot available
  // 2. If not, finds lowest priority stream
  // 3. Preempts it if priority difference > threshold
  // 4. Allocates decoder to critical camera
  // 5. Downgrades evicted camera to snapshot mode
};

// Operator focuses on camera
const handleCameraFocus = (cameraId: string) => {
  setOperatorSelectedCameraId(cameraId);
  
  // Scheduler automatically:
  // 1. Assigns P0 priority (highest)
  // 2. Upgrades to main stream
  // 3. Cannot be preempted by alerts
};
```

## Decoder Budget Configuration

```tsx
// Emergency reserve for critical alerts
const budget = {
  total: 36,              // Total decoder capacity
  normal: 32,             // Normal pool
  emergencyReserve: 4,    // Reserved for P1 alerts
};

// Normal operations use 32 decoders
// P1 alerts can use emergency 4 + preempt normal pool
```

## Snapshot Configuration

```tsx
// Priority-based refresh intervals
const SNAPSHOT_INTERVALS = {
  P0_OPERATOR_PINNED: 1000,  // 1s (shouldn't happen)
  P1_CRITICAL: 2000,         // 2s
  P2_HIGH: 3000,             // 3s
  P3_INCIDENT: 5000,         // 5s
  P4_VISIBLE: 10000,         // 10s
  P5_ROTATION: 15000,        // 15s
  P6_BACKGROUND: 30000,      // 30s
};
```

## Capacity Monitoring

The `CapacityMonitor` component shows:
- Decoder utilization (current / max)
- Bandwidth consumption (Mbps)
- Decode load (pixels/second)
- Hardware acceleration status
- Codec support
- Stream distribution (live vs snapshot)
- Priority breakdown

## Performance Monitoring

The system automatically monitors:
- Dropped frame ratio
- Decode latency
- Buffer health
- Stall count

If performance degrades:
1. Sustained >5% dropped frames for 5s → decrease capacity
2. Sustained healthy state for 30s → increase capacity

## Migration Path

### Phase 1: Add Capacity Detection
- Initialize ViewerCapacityManager
- Log detected capacity
- Compare with current fixed limits

### Phase 2: Add Monitoring UI
- Render CapacityMonitor component
- Display current decoder usage
- Show degradation warnings

### Phase 3: Enable Priority Scheduling
- Convert alert cameras to P1/P2 priorities
- Add operator selection → P0
- Enable preemption logic

### Phase 4: Enable Snapshot Mode
- Initialize SnapshotService
- Configure refresh intervals
- Update CameraTile to render snapshots

### Phase 5: Full Integration
- Replace fixed decoder limits
- Enable emergency reserve
- Activate rotation scheduling

## API Requirements

### Server Snapshot Endpoint

The system expects:
```
GET /api/cameras/:cameraId/snapshot
Response: image/jpeg
```

If unavailable, client-side extraction from video elements is used as fallback.

### Camera Capabilities (Future)

Eventually, cameras should expose stream profiles:
```json
{
  "cameraId": "cam-12",
  "profiles": [
    {
      "type": "MAIN",
      "codec": "H265",
      "width": 2560,
      "height": 1440,
      "fps": 25,
      "bitrateKbps": 4096
    },
    {
      "type": "SUB",
      "codec": "H264",
      "width": 640,
      "height": 360,
      "fps": 10,
      "bitrateKbps": 384
    }
  ]
}
```

## Benefits

1. **Scalability**: Supports 400+ branches with thousands of cameras
2. **Responsiveness**: Critical alerts get immediate decoder allocation
3. **Efficiency**: Snapshots reduce bandwidth for background cameras
4. **Adaptability**: Automatically adjusts to workstation capabilities
5. **Reliability**: Graceful degradation under resource pressure
6. **Visibility**: Clear capacity monitoring and diagnostics

## No Paid APIs Required

All components use:
- Browser native APIs (WebCodecs, MediaSource, VideoElement)
- Standard WebRTC/HLS/RTSP protocols
- Local capacity detection
- Client-side or self-hosted snapshots

No external services or API keys required.
