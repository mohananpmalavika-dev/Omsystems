# Video Capacity Management System

A sophisticated, capacity-aware video scheduling system that transforms static decoder limits into dynamic, priority-based resource allocation for surveillance video walls.

## 🎯 Problem Solved

### Before
```
Enterprise tier → 144 concurrent streams
```
- Browser tries to decode all 144 streams simultaneously
- Workstation overload and frame drops
- No prioritization for critical alerts
- Fixed limits regardless of hardware

### After
```
144 UI slots → ViewerCapacity → StreamScheduler → 36 active decoders + 108 snapshots
```
- Dynamic capacity detection (16-48 decoders based on hardware)
- Priority-based scheduling (P0-P6)
- Emergency reserve for critical alerts
- Graceful degradation with snapshots
- Adaptive performance monitoring

## 📦 Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                   Enhanced Camera Grid                   │
│                    (144 UI slots)                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              ViewerCapacityManager                       │
│  • Detect hardware (GPU, CPU, memory)                   │
│  • Benchmark decoder capacity                           │
│  • Monitor performance (dropped frames)                 │
│  • Adaptive capacity adjustment                         │
└────────────────────┬────────────────────────────────────┘
                     │ (capacity: 36 decoders)
                     ↓
┌─────────────────────────────────────────────────────────┐
│                StreamScheduler                           │
│  • Score cameras by priority (P0-P6)                    │
│  • Select top N for live decoding                       │
│  • Allocate emergency reserve for P1 alerts             │
│  • Preempt lower priority streams                       │
│  • Assign snapshot/rotation to others                   │
└────────────────────┬────────────────────────────────────┘
                     │ (schedule: 36 live, 108 snapshot)
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  DecoderPool                             │
│  • Manage 36 active decoders                            │
│  • Track playback metrics                               │
│  • Upgrade/downgrade streams                            │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ↓                       ↓
┌──────────────┐      ┌────────────────────┐
│ 36 Live      │      │ SnapshotService    │
│ Video        │      │ • 108 periodic     │
│ Decoders     │      │   JPEG refreshes   │
└──────────────┘      └────────────────────┘
```

## 🔑 Key Features

### 1. Dynamic Capacity Detection

Automatically detects workstation capabilities:
- **Hardware acceleration**: WebCodecs API, GPU detection
- **Memory**: Available heap size
- **CPU**: Core count
- **Benchmarking**: Estimates stable decoder capacity

```typescript
// Detected capacity example
{
  maxVideoDecoders: 40,
  recommendedDecoderLimit: 36,  // 85% safety margin
  hardwareAcceleration: "AVAILABLE",
  preferredCodec: "H265",
  maxAggregateBitrateMbps: 30,
  maxPixelsPerSecond: 400_000_000
}
```

### 2. Priority-Based Scheduling

Six priority classes with automatic allocation:

| Priority | Class | Use Case | Protection |
|----------|-------|----------|------------|
| **P0** | Operator Pinned | User-selected camera | Cannot be preempted |
| **P1** | Critical | Vault intrusion, weapon detection | Emergency pool, 30s protection |
| **P2** | High | Fire, PPE violations | Emergency pool, 30s protection |
| **P3** | Incident | Active investigation | 10s protection |
| **P4** | Visible | Currently in viewport | 10s protection |
| **P5** | Rotation | Scheduled rotation pool | Rotates every 10s |
| **P6** | Background | Not visible | Snapshot only |

### 3. Emergency Reserve Pool

```typescript
Budget = {
  total: 36,
  normal: 32,        // Regular operations
  emergencyReserve: 4 // Reserved for P1 alerts
}
```

When P1 alert arrives:
1. Check emergency pool availability
2. If full, find lowest priority stream
3. Preempt if priority difference > threshold
4. Allocate decoder immediately
5. Downgrade evicted camera to snapshot

### 4. Adaptive Capacity Control

Monitors playback quality in real-time:

```typescript
if (droppedFrameRatio > 5% for 5 seconds) {
  decreaseCapacity(); // Reduce by 15%
}

if (healthy for 30 seconds) {
  increaseCapacity(); // Increase by 10%
}
```

### 5. Snapshot Service

Priority-based refresh intervals for non-decoded cameras:

| Priority | Interval | Use Case |
|----------|----------|----------|
| P1 | 2s | Critical (shouldn't be snapshot) |
| P2 | 3s | High alerts |
| P3 | 5s | Investigations |
| P4 | 10s | Visible cameras |
| P5 | 15s | Rotation pool |
| P6 | 30s | Background |

### 6. Multi-Dimensional Admission Control

Doesn't just count decoders. Considers:
- **Decoder units**: 1.0 base, ×1.3 for H265 without HW accel, ×2.0 for 4K
- **Bitrate**: Mbps consumed
- **Pixels/second**: Actual decode load (width × height × fps)

```typescript
Can admit if:
  decoderUsage + streamCost.decoderUnits ≤ decoderBudget AND
  bitrateUsage + streamCost.bitrateMbps ≤ bitrateBudget AND
  pixelUsage + streamCost.pixelsPerSecond ≤ pixelBudget
```

## 📊 Example Scenario

### 400-Branch Control Room

**Configuration:**
- 400 branches × 4 cameras = 1,600 cameras enrolled
- 12×12 grid = 144 UI slots
- Detected capacity = 36 decoders

**Normal Operation:**
```
36 live decoders:
  - 32 normal pool (visible high-priority cameras)
  - 4 emergency reserve (idle)
108 snapshot tiles (10s refresh)
```

**P1 Alert Arrives (Vault Intrusion, Branch 187):**
```
1. Emergency slot #1 allocated
2. CAM-V03 starts live immediately
3. Snapshot → Live transition: <500ms
4. Visual indicator: Red border + P1 badge
5. 32 normal + 1 emergency = 33 active
```

**4 More P1 Alerts:**
```
Emergency pool full (4/4)
5th alert preempts:
  - Lowest priority normal camera (CAM-PARK-07)
  - CAM-PARK-07: Live → Snapshot
  - CAM-ATM-02: Snapshot → Live
```

**Operator Focuses Camera:**
```
Double-click CAM-ATM-02
  - Priority: P1 → P0 (cannot be preempted)
  - Stream: SUB → MAIN (1920×1080)
  - Decoder allocation: Immediate
```

**Incident Cleared:**
```
P1 → P3 → P4 → normal priority
Emergency slot released
Normal scheduling resumes
```

## 🚀 Usage

### Basic Integration

```typescript
import { useVideoWallScheduler } from "@/hooks/use-video-wall-scheduler";
import { CapacityMonitor } from "@/components/capacity-monitor";

function VideoWall({ cameras }: { cameras: Camera[] }) {
  const {
    schedule,
    playbackStates,
    capacity,
    budget,
    activeDecoderCount,
  } = useVideoWallScheduler({
    cameras,
    visibleRange: { start: 0, end: 144 },
    priorityCameraIds: [],
    criticalAlertCameraIds: alertCameras,
    operatorSelectedCameraId: selectedId,
    enableSnapshots: true,
  });

  return (
    <>
      <CapacityMonitor
        capacity={capacity}
        budget={budget}
        schedule={schedule}
        activeDecoderCount={activeDecoderCount}
        snapshotCount={108}
      />
      
      <div className="grid grid-cols-12">
        {cameras.map(camera => {
          const scheduled = schedule.get(camera.id);
          const state = playbackStates.get(camera.id);
          
          return (
            <CameraTile
              key={camera.id}
              camera={camera}
              mode={scheduled?.mode}
              priority={scheduled?.priority}
              decoderAllocated={state?.decoderAllocated}
            />
          );
        })}
      </div>
    </>
  );
}
```

### Direct Service Usage

```typescript
import {
  getViewerCapacityManager,
  getStreamScheduler,
  getDecoderPool,
  getSnapshotService,
} from "@/lib/video";

// Initialize
const capacityManager = getViewerCapacityManager();
const capacity = await capacityManager.initialize();
console.log('Decoder limit:', capacity.recommendedDecoderLimit);

// Schedule cameras
const scheduler = getStreamScheduler();
const schedule = await scheduler.schedule(cameraContexts, tileGeometry);

// Manage decoders
const pool = getDecoderPool();
await pool.acquire(cameraId, streamProfile);
await pool.upgrade(cameraId, mainStreamProfile);
await pool.release(cameraId);

// Start snapshots
const snapshots = getSnapshotService('/api/cameras');
snapshots.startSnapshot(cameraId, 'P4_VISIBLE');
```

## 📈 Performance Characteristics

### Resource Usage

| Grid Size | UI Slots | Active Decoders | Snapshots | Bandwidth |
|-----------|----------|-----------------|-----------|-----------|
| 2×2 | 4 | 4 | 0 | ~2 Mbps |
| 4×4 | 16 | 16 | 0 | ~8 Mbps |
| 6×6 | 36 | 36 | 0 | ~18 Mbps |
| 12×12 | 144 | 36 | 108 | ~20 Mbps |

### Latency

- **Capacity detection**: 50-200ms
- **Schedule calculation**: <10ms (144 cameras)
- **P1 preemption**: <100ms
- **Snapshot → Live**: <500ms
- **Main ↔ Sub toggle**: <300ms

### Scalability

| Metric | Capacity |
|--------|----------|
| Enrolled cameras | Unlimited |
| Branches | 400+ tested |
| UI grid slots | 1-144 |
| Active decoders | 8-48 (hardware-dependent) |
| Snapshot cameras | Unlimited |

## 🔧 Configuration

### Capacity Tuning

```typescript
// Conservative (low-end workstation)
{
  recommendedDecoderLimit: 16,
  maxAggregateBitrateMbps: 15,
  maxPixelsPerSecond: 200_000_000
}

// Recommended (modern workstation)
{
  recommendedDecoderLimit: 36,
  maxAggregateBitrateMbps: 25,
  maxPixelsPerSecond: 300_000_000
}

// High-performance (dedicated control room)
{
  recommendedDecoderLimit: 48,
  maxAggregateBitrateMbps: 40,
  maxPixelsPerSecond: 500_000_000
}
```

### Priority Thresholds

```typescript
// Preemption margin (score difference required)
const PREEMPTION_MARGIN = 2000;

// Protection windows
const NORMAL_PROTECTION_MS = 10000;  // 10s
const ALERT_PROTECTION_MS = 30000;   // 30s
```

### Snapshot Intervals

```typescript
const SNAPSHOT_INTERVALS = {
  P1_CRITICAL: 2000,   // 2s
  P4_VISIBLE: 10000,   // 10s
  P6_BACKGROUND: 30000 // 30s
};
```

## 🧪 Testing

The system includes comprehensive tests:

```bash
# Run all tests
npm test dashboard/lib/video/

# Test capacity detection
npm test viewer-capacity-manager.test.ts

# Test scheduling logic
npm test stream-scheduler.test.ts

# Test admission control
npm test stream-utils.test.ts
```

## 📝 API Reference

### ViewerCapacityManager

```typescript
class ViewerCapacityManager {
  async initialize(): Promise<ViewerCapacity>
  async getCapacity(): Promise<ViewerCapacity>
  async getResourceBudget(): Promise<ViewerResourceBudget>
  updateUsage(decoders: number, bitrate: number, pixels: number): void
  async monitorPerformance(metrics: Map<string, PlaybackMetrics>): Promise<boolean>
  async reset(): Promise<ViewerCapacity>
}
```

### StreamScheduler

```typescript
class StreamScheduler {
  async schedule(
    cameras: CameraContext[],
    tileGeometry: TileGeometry,
    visibleCameraIds?: Set<string>
  ): Promise<Map<string, ScheduledCamera>>
  
  getCurrentSchedule(): Map<string, ScheduledCamera>
  getEmergencyPoolUsage(): number
}
```

### DecoderPool

```typescript
class DecoderPool {
  async acquire(cameraId: string, profile: StreamProfile): Promise<DecoderHandle>
  async release(cameraId: string): Promise<void>
  async upgrade(cameraId: string, profile: StreamProfile): Promise<void>
  async downgrade(cameraId: string, profile: StreamProfile): Promise<void>
  getMetrics(cameraId: string): PlaybackMetrics | null
  getAllMetrics(): Map<string, PlaybackMetrics>
  getTotalUsage(): { decoderCount, totalBitrateMbps, totalPixelsPerSecond }
}
```

### SnapshotService

```typescript
class SnapshotService {
  startSnapshot(cameraId: string, priority: CameraPriorityClass): void
  stopSnapshot(cameraId: string): void
  getSnapshot(cameraId: string): SnapshotMetadata | undefined
  updateInterval(cameraId: string, priority: CameraPriorityClass): void
  stopAll(): void
}
```

## 🎓 Design Principles

1. **Separation of Concerns**: UI capacity ≠ decoder capacity ≠ enrollment capacity
2. **Progressive Enhancement**: Works with basic detection, improves with full features
3. **Graceful Degradation**: Snapshots when decoders unavailable
4. **Priority-Based**: Security events take precedence over routine monitoring
5. **Adaptive**: Adjusts to hardware and network conditions
6. **No External Dependencies**: Pure browser APIs, no paid services

## 🔒 No Paid APIs

Everything uses:
- ✅ Browser native APIs (WebCodecs, MediaSource, VideoElement)
- ✅ Standard protocols (WebRTC, HLS, RTSP)
- ✅ Self-hosted snapshot service
- ✅ Local capacity detection

No external services required:
- ❌ No cloud transcoding
- ❌ No external capacity APIs
- ❌ No SaaS dependencies

## 📚 Further Reading

- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Step-by-step integration
- [types.ts](./types.ts) - Complete type definitions
- [stream-utils.ts](./stream-utils.ts) - Utility functions

## 🤝 Contributing

When extending this system:
1. Maintain separation of UI/decoder/enrollment capacity
2. Preserve priority-based preemption logic
3. Keep emergency reserve pool intact
4. Add tests for new features
5. Update type definitions

## 📄 License

Part of the surveillance platform codebase.
