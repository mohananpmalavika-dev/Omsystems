# Quick Start Guide - Video Capacity Management

Get the capacity-aware video wall running in 5 minutes.

## 🚀 Basic Usage

### 1. Import the Hook

```tsx
import { useVideoWallScheduler } from "@/hooks/use-video-wall-scheduler";
import { CapacityMonitor } from "@/components/capacity-monitor";
```

### 2. Initialize in Your Component

```tsx
function MyVideoWall({ cameras }: { cameras: Camera[] }) {
  const {
    schedule,
    playbackStates,
    capacity,
    budget,
    activeDecoderCount,
    snapshotCount,
  } = useVideoWallScheduler({
    cameras,                    // Your camera array
    visibleRange: { start: 0, end: 144 },
    priorityCameraIds: [],      // High-priority cameras
    enableSnapshots: true,
  });

  if (!capacity) {
    return <div>Detecting viewer capacity...</div>;
  }

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
      
      <div className="grid grid-cols-12">
        {cameras.map(camera => {
          const scheduled = schedule.get(camera.id);
          const state = playbackStates.get(camera.id);
          
          return (
            <CameraTile
              key={camera.id}
              camera={camera}
              mode={scheduled?.mode}
              decoderAllocated={state?.decoderAllocated}
            />
          );
        })}
      </div>
    </>
  );
}
```

### 3. Update CameraTile to Handle Modes

```tsx
function CameraTile({ camera, mode, decoderAllocated }) {
  switch (mode) {
    case "MAIN_STREAM":
    case "SUB_STREAM":
      // Show live video
      return <LiveVideoPlayer camera={camera} />;
      
    case "SNAPSHOT":
      // Show periodic snapshot
      return <SnapshotView camera={camera} />;
      
    default:
      return <PlaceholderView camera={camera} />;
  }
}
```

## 🎯 Common Scenarios

### Scenario 1: Add Critical Alert Handling

```tsx
const [criticalAlerts, setCriticalAlerts] = useState<string[]>([]);

const {
  schedule,
  capacity,
} = useVideoWallScheduler({
  cameras,
  criticalAlertCameraIds: criticalAlerts,  // P1 priority
  enableSnapshots: true,
});

// When alert arrives
function handleAlert(alert: Alert) {
  if (alert.severity === "CRITICAL") {
    setCriticalAlerts(prev => [...prev, alert.cameraId]);
    // Scheduler automatically preempts lower priority stream
  }
}
```

### Scenario 2: Add Operator Focus

```tsx
const [selectedCamera, setSelectedCamera] = useState<string | null>(null);

const {
  schedule,
} = useVideoWallScheduler({
  cameras,
  operatorSelectedCameraId: selectedCamera,  // P0 priority
  enableSnapshots: true,
});

// When operator double-clicks camera
function handleCameraFocus(cameraId: string) {
  setSelectedCamera(cameraId);
  // Scheduler immediately allocates decoder
  // Upgrades to main stream
  // Cannot be preempted
}
```

### Scenario 3: Track Incidents

```tsx
const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);

const incidentCameraIds = activeIncidents
  .flatMap(incident => incident.cameraIds);

const {
  schedule,
} = useVideoWallScheduler({
  cameras,
  incidentCameraIds,  // P3 priority
  enableSnapshots: true,
});
```

### Scenario 4: Branch Selection Priority

```tsx
const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

const {
  schedule,
} = useVideoWallScheduler({
  cameras,
  branchSelectedId: selectedBranch,  // Boosts priority for branch cameras
  enableSnapshots: true,
});
```

## 🔧 Configuration Options

### Full Options

```tsx
useVideoWallScheduler({
  // Required
  cameras: Camera[],

  // Grid configuration
  visibleRange?: { start: number; end: number },
  gridPositions?: Map<number, { cameraId: string; stream: "main" | "sub" }>,

  // Priority lists
  priorityCameraIds?: string[],           // General high priority
  alertCameraIds?: string[],              // P2 High alerts
  criticalAlertCameraIds?: string[],      // P1 Critical alerts
  incidentCameraIds?: string[],           // P3 Investigations
  operatorSelectedCameraId?: string,      // P0 Operator focus
  operatorPinnedCameraIds?: string[],     // P0 Pinned cameras
  branchSelectedId?: string,              // Branch boost

  // Snapshot configuration
  enableSnapshots?: boolean,              // Default: true
  snapshotBaseUrl?: string,               // Default: '/api/cameras'

  // Callbacks
  onScheduleChange?: (schedule: Map<string, ScheduledCamera>) => void,
  onCapacityChange?: (capacity: ViewerCapacity, budget: ViewerResourceBudget) => void,
})
```

### Return Values

```tsx
const {
  // Current schedule
  schedule: Map<string, ScheduledCamera>,
  playbackStates: Map<string, CameraPlaybackState>,
  
  // Capacity info
  capacity: ViewerCapacity | null,
  budget: ViewerResourceBudget | null,
  
  // Status
  isInitialized: boolean,
  activeDecoderCount: number,
  snapshotCount: number,
  
  // Control
  refresh: () => Promise<void>,
  resetCapacity: () => Promise<void>,
} = useVideoWallScheduler(options);
```

## 📊 Understanding the Schedule

### ScheduledCamera Object

```typescript
{
  cameraId: "cam-123",
  mode: "SUB_STREAM",           // What to display
  priority: "P1_CRITICAL",      // Why it's scheduled
  priorityScore: 9500,          // Numeric priority
  reason: "CRITICAL_ALERT",     // Human-readable reason
  streamProfile: {              // Stream details
    codec: "H264",
    width: 640,
    height: 360,
    fps: 10,
    estimatedBitrateKbps: 512
  },
  streamCost: {                 // Resource cost
    decoderUnits: 1.0,
    bitrateMbps: 0.5,
    pixelsPerSecond: 2304000
  }
}
```

### CameraPlaybackState Object

```typescript
{
  cameraId: "cam-123",
  desiredMode: "SUB_STREAM",
  actualMode: "SUB_STREAM",
  priority: "P1_CRITICAL",
  priorityScore: 9500,
  decoderAllocated: true,
  bitrateMbps: 0.5,
  pixelsPerSecond: 2304000,
  lastActivatedAt: 1234567890,
  degradationReason: undefined  // Only set if degraded
}
```

## 🎨 Capacity Monitor Variants

### Compact (Toolbar)

```tsx
<CapacityMonitor
  capacity={capacity}
  budget={budget}
  schedule={schedule}
  activeDecoderCount={activeDecoderCount}
  snapshotCount={snapshotCount}
  compact={true}  // Minimal display
/>
```

### Expanded (Dashboard)

```tsx
<CapacityMonitor
  capacity={capacity}
  budget={budget}
  schedule={schedule}
  activeDecoderCount={activeDecoderCount}
  snapshotCount={snapshotCount}
  compact={false}  // Full details
/>
```

## 🔍 Debugging

### Log Schedule Changes

```tsx
useVideoWallScheduler({
  cameras,
  onScheduleChange: (schedule) => {
    const live = Array.from(schedule.values()).filter(
      s => s.mode === "MAIN_STREAM" || s.mode === "SUB_STREAM"
    );
    console.log(`Schedule updated: ${live.length} live, ${schedule.size - live.length} snapshot`);
  },
});
```

### Log Capacity Changes

```tsx
useVideoWallScheduler({
  cameras,
  onCapacityChange: (capacity, budget) => {
    console.log('Capacity:', capacity.recommendedDecoderLimit);
    console.log('Usage:', budget.decoderUsage, '/', budget.decoderBudget);
  },
});
```

### Inspect Individual Camera State

```tsx
const { playbackStates } = useVideoWallScheduler({ cameras });

const cameraState = playbackStates.get("cam-123");
console.log('Camera state:', {
  mode: cameraState?.actualMode,
  priority: cameraState?.priority,
  decoder: cameraState?.decoderAllocated,
  degraded: cameraState?.degradationReason,
});
```

## ⚡ Performance Tips

### 1. Optimize Visible Range

```tsx
// Only schedule cameras in viewport
const visibleRange = {
  start: Math.floor(scrollTop / tileHeight) * columns,
  end: Math.ceil((scrollTop + viewportHeight) / tileHeight) * columns
};
```

### 2. Memoize Camera Lists

```tsx
const criticalCameras = useMemo(
  () => alerts.filter(a => a.severity === "CRITICAL").map(a => a.cameraId),
  [alerts]
);
```

### 3. Debounce Rapid Changes

```tsx
const debouncedSelectedBranch = useDebounce(selectedBranch, 300);

useVideoWallScheduler({
  cameras,
  branchSelectedId: debouncedSelectedBranch,
});
```

## 🚨 Common Issues

### Issue: "useStreamScheduler must be used within StreamSchedulerProvider"

**Solution**: Remove old StreamSchedulerProvider wrapper, use new hook directly.

### Issue: Capacity shows 0 decoders

**Solution**: Wait for initialization. Check `isInitialized` before rendering.

```tsx
const { capacity, isInitialized } = useVideoWallScheduler({ cameras });

if (!isInitialized) {
  return <LoadingSpinner />;
}
```

### Issue: All cameras showing snapshots

**Solution**: Check that some cameras are visible and have proper priority.

```tsx
console.log('Visible cameras:', visibleRange);
console.log('Priority cameras:', priorityCameraIds);
```

### Issue: Critical alerts not preempting

**Solution**: Verify `criticalAlertCameraIds` is updating correctly.

```tsx
useEffect(() => {
  console.log('Critical alerts:', criticalAlertCameraIds);
}, [criticalAlertCameraIds]);
```

## 📚 Next Steps

- Read [README.md](./README.md) for complete documentation
- See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for migration path
- Check [types.ts](./types.ts) for full type definitions

## 💬 Questions?

Common questions:

**Q: Do I need to replace my entire grid?**  
A: No. Start with just monitoring (Phase 1), then gradually adopt scheduling.

**Q: Will this work with my existing camera tiles?**  
A: Yes. Just add `mode` prop to handle SNAPSHOT display.

**Q: Can I customize priority scoring?**  
A: Yes. Modify `scoreCamera()` in `stream-utils.ts`.

**Q: Do I need a snapshot server?**  
A: No. Client-side extraction works as fallback. Server is recommended.

**Q: What if my workstation has more capacity?**  
A: System auto-detects. Can manually set higher limits if needed.

---

That's it! You now have a capacity-aware video wall with intelligent scheduling. 🎉
