/**
 * Adaptive Video Wall & Decoder Capacity Manager - Verification Test Runner
 */

import {
  detectViewerCapacity,
  calculateCameraPriority,
  PriorityTier,
  selectTargetStreamConfig,
  ViewportTracker,
  calculateStreamCost,
  PlaybackBudgetManager,
  DecoderScheduler,
  type CameraSchedulingContext,
} from "../../dashboard/lib/video-wall/index.js";

async function runVideoWallTests() {
  console.log("================================================================================");
  console.log("  ADAPTIVE VIDEO WALL & DECODER CAPACITY MANAGER - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  // 1. Capacity Detection Tests
  console.log("Suite 1: Viewer Hardware & Capacity Detection");
  const defaultCapacity = detectViewerCapacity();
  assert(defaultCapacity.maxGridSlots === 144, "Default grid slots configured for 144 positions");
  assert(defaultCapacity.maxActiveDecoders > 0, "Safe active decoders derived from hardware profile");
  assert(defaultCapacity.maxAggregateBitrateMbps > 0, "Calculates aggregate bandwidth budget (Mbps)");
  assert(defaultCapacity.maxPixelsPerSecond > 0, "Calculates pixel processing throughput budget");

  const customCapacity = detectViewerCapacity(32);
  assert(customCapacity.maxActiveDecoders === 32, "Custom decoder limit applied cleanly (32 decoders)");
  assert(customCapacity.maxMainStreams <= 4, "Main streams bounded to preserve decoding budget");

  // 2. Priority Scoring Tests
  console.log("\nSuite 2: Security-Driven Priority Scoring Engine");
  const baseContext: CameraSchedulingContext = {
    cameraId: "cam-01",
    branchId: "branch-01",
    isVisible: true,
    isSelected: false,
    isPinned: false,
    isFullscreen: false,
    hasCriticalAlert: false,
    hasHighAlert: false,
    isOffline: false,
    recordingFailure: false,
    healthWarning: false,
    operatorRecentlyViewed: false,
    positionInViewport: 0,
    desiredQuality: "SUB",
    purpose: "GRID_MONITORING",
  };

  const normalScore = calculateCameraPriority(baseContext);
  const criticalScore = calculateCameraPriority({ ...baseContext, hasCriticalAlert: true });
  const fullscreenScore = calculateCameraPriority({ ...baseContext, isFullscreen: true });
  const selectedScore = calculateCameraPriority({ ...baseContext, isSelected: true });
  const pinnedScore = calculateCameraPriority({ ...baseContext, isPinned: true });
  const recFailScore = calculateCameraPriority({ ...baseContext, recordingFailure: true });
  const offlineScore = calculateCameraPriority({ ...baseContext, isOffline: true });

  assert(offlineScore === 0, "Offline cameras receive 0 priority (no decoder consumption)");
  assert(fullscreenScore > criticalScore, "Fullscreen (P0) takes precedence over Critical Alert (P1)");
  assert(criticalScore > selectedScore, "Critical Alert (P1) takes precedence over Selected (P2)");
  assert(selectedScore > pinnedScore, "Selected (P2) takes precedence over Pinned (P3)");
  assert(pinnedScore > recFailScore, "Pinned (P3) takes precedence over Recording Failure (P5)");
  assert(recFailScore > normalScore, "Recording Failure (P5) takes precedence over Normal Visible (P6)");

  // 3. Stream Profile & Resolution Selector Tests
  console.log("\nSuite 3: Dynamic Stream Profile & Tile Size Selector");
  const fullscreenConfig = selectTargetStreamConfig({ ...baseContext, isFullscreen: true }, 1920, 1080);
  assert(fullscreenConfig.profile === "MAIN" && fullscreenConfig.width === 1920, "Fullscreen tile receives 1080p Main Stream");

  const denseGridConfig = selectTargetStreamConfig(baseContext, 160, 90);
  assert(denseGridConfig.profile === "SUB" && denseGridConfig.width <= 640, "Dense grid (12x12) receives low-bandwidth Substream");

  // 4. Viewport Tracking & Grace Period Hysteresis Tests
  console.log("\nSuite 4: Viewport Range Tracking & Offscreen Grace Period");
  const tracker = new ViewportTracker(3000);
  const t0 = 1000;
  const inView = tracker.isCameraEffectivelyVisible("cam-01", 5, { startIndex: 0, endIndex: 10 }, t0);
  assert(inView.isVisible === true && inView.inGracePeriod === false, "In-view camera is immediately visible");

  const scrolledOff = tracker.isCameraEffectivelyVisible("cam-01", 15, { startIndex: 0, endIndex: 10 }, t0 + 1000);
  assert(scrolledOff.isVisible === true && scrolledOff.inGracePeriod === true, "Off-screen camera stays active during 3s grace period");

  const graceExpired = tracker.isCameraEffectivelyVisible("cam-01", 15, { startIndex: 0, endIndex: 10 }, t0 + 5500);
  assert(graceExpired.isVisible === false && graceExpired.inGracePeriod === false, "Grace period expires after 3000ms");

  // 5. Decoder Scheduling for 144 Positions Tests
  console.log("\nSuite 5: 144-Position Video Wall Declarative Scheduler");
  const scheduler = new DecoderScheduler({
    maxGridSlots: 144,
    maxActiveDecoders: 32,
    maxAggregateBitrateMbps: 80,
    maxPixelsPerSecond: 180_000_000,
    maxMainStreams: 4,
    maxSubStreams: 28,
    hardwareAcceleration: "AVAILABLE",
  });

  // Generate 144 cameras
  const contexts144: CameraSchedulingContext[] = Array.from({ length: 144 }, (_, i) => ({
    cameraId: `cam-${String(i + 1).padStart(3, "0")}`,
    branchId: `branch-${Math.floor(i / 16) + 1}`,
    isVisible: i < 36,
    isSelected: i === 0,
    isPinned: i === 1,
    isFullscreen: false,
    hasCriticalAlert: i === 7, // CAM-008 has critical alert
    hasHighAlert: false,
    isOffline: false,
    recordingFailure: i === 15,
    healthWarning: false,
    operatorRecentlyViewed: false,
    positionInViewport: i,
    desiredQuality: "SUB",
    purpose: "GRID_MONITORING",
    tileWidth: 240,
    tileHeight: 135,
  }));

  const { allocations, telemetry } = scheduler.schedule(contexts144);

  assert(allocations.size === 144, "Scheduler allocated all 144 camera positions");
  assert(telemetry.activeStreams <= 32, `Active decoders bounded to safe capacity (${telemetry.activeStreams} / 32)`);
  assert(telemetry.snapshots === 144 - telemetry.activeStreams, `Remaining ${telemetry.snapshots} tiles allocated to SNAPSHOT mode`);
  assert(telemetry.decoderUtilizationPercent <= 100, `Decoder utilization tracked (${telemetry.decoderUtilizationPercent}%)`);
  assert(telemetry.aggregateBitrateMbps > 0, `Aggregate bandwidth tracked (${telemetry.aggregateBitrateMbps} Mbps)`);

  const cam008Alloc = allocations.get("cam-008");
  assert(cam008Alloc?.mode === "SUB_STREAM" || cam008Alloc?.mode === "MAIN_STREAM", "CAM-008 with critical alert is allocated active video stream");
  assert(cam008Alloc?.reason === "CRITICAL_ALERT", "CAM-008 allocation reason is CRITICAL_ALERT");

  const cam001Alloc = allocations.get("cam-001");
  assert(cam001Alloc?.reason === "SELECTED", "CAM-001 allocation reason is SELECTED");

  const cam140Alloc = allocations.get("cam-140");
  assert(cam140Alloc?.mode === "SNAPSHOT", "CAM-140 is in SNAPSHOT mode (non-decoded position)");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runVideoWallTests().catch((err) => {
  console.error("Test runner execution failed:", err);
  process.exit(1);
});
