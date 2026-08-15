/**
 * Viewer Capacity Manager & 144-Position Decoder Scheduler - Verification Test Runner
 */

import {
  ViewerCapacityManager,
  calculateStreamCost,
  pixelsPerSecond,
  calculatePriorityScore,
  resolvePriorityTier,
  filterByFairnessPolicy,
  PerformanceMonitor,
  getNextDegradedProfile,
  profileWorkstation,
  type StreamCandidate,
  type StreamProfile,
} from "../../dashboard/lib/viewer-capacity/index.js";

async function runViewerCapacityTests() {
  console.log("================================================================================");
  console.log("  VIEWER CAPACITY MANAGER & DECODER SCHEDULER - VERIFICATION TEST RUNNER");
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

  // 1. Decoupling Entitlement from Capacity
  console.log("Suite 1: Entitlement vs Hardware Decoding Capacity Decoupling");
  const manager = new ViewerCapacityManager({
    maxVideoDecoders: 36,
    maxAggregateBitrateMbps: 30,
    maxPixelsPerSecond: 180_000_000,
  });

  const entitlement = manager.getEntitlement();
  const capacity = manager.getCapacity();

  assert(entitlement.maxGridPositions === 144, "Entitlement permits 144 visible grid positions");
  assert(capacity.maxVideoDecoders === 36, "Hardware capacity safely limits active decoders to 36");
  assert(entitlement.maxGridPositions !== capacity.maxVideoDecoders, "Grid positions and active decoders are strictly decoupled");

  // 2. Stream Cost & Multi-Dimensional Pixel Budget
  console.log("\nSuite 2: Multi-Dimensional Stream Cost & Pixel Budget");
  const subStream: StreamProfile = {
    cameraId: "cam-sub",
    codec: "H264",
    width: 640,
    height: 360,
    fps: 8,
    bitrateMbps: 0.45,
    streamType: "SUB",
    transport: "WEBRTC",
  };

  const mainStream: StreamProfile = {
    cameraId: "cam-main",
    codec: "H264",
    width: 1920,
    height: 1080,
    fps: 25,
    bitrateMbps: 3.5,
    streamType: "MAIN",
    transport: "WEBRTC",
  };

  const subCost = calculateStreamCost(subStream);
  const mainCost = calculateStreamCost(mainStream);

  assert(pixelsPerSecond(subStream) === 640 * 360 * 8, "Substream pps calculates accurately (1.84M pps)");
  assert(pixelsPerSecond(mainStream) === 1920 * 1080 * 25, "Main stream pps calculates accurately (51.84M pps)");
  assert(mainCost.decoderUnits > subCost.decoderUnits * 5, "1080p Main stream cost is over 5x higher than 360p Substream");

  // 3. Deterministic Security-Driven Priority Scoring
  console.log("\nSuite 3: Deterministic Security-Driven Priority Scoring");
  const baseCandidate: StreamCandidate = {
    cameraId: "cam-01",
    branchId: "branch-01",
    priority: "P3",
    requestedQuality: "GRID",
    stream: subStream,
    visible: true,
    selected: false,
    alarmActive: false,
    pinned: false,
  };

  const p0Score = calculatePriorityScore({ ...baseCandidate, selected: true, requestedQuality: "FOCUSED" });
  const p1Score = calculatePriorityScore({ ...baseCandidate, alertSeverity: "CRITICAL" });
  const p2Score = calculatePriorityScore({ ...baseCandidate, alertSeverity: "HIGH" });
  const p3Score = calculatePriorityScore({ ...baseCandidate, pinned: true });
  const normalVisibleScore = calculatePriorityScore(baseCandidate);
  const offlineScore = calculatePriorityScore({ ...baseCandidate, healthState: "OFFLINE" });

  assert(offlineScore === 0, "Offline cameras receive 0 priority score");
  assert(p0Score > p1Score, "P0 (Selected/Fullscreen: 11000+) takes precedence over P1 (Critical: 9000+)");
  assert(p1Score > p2Score, "P1 (Critical: 9000+) takes precedence over P2 (High: 6000+)");
  assert(p2Score > p3Score, "P2 (High alert) takes precedence over P3 (Pinned)");
  assert(p3Score > normalVisibleScore, "P3 (Pinned: 5000+) takes precedence over Normal Visible (2000+)");

  // 4. Instant P1 Preemption Workflow
  console.log("\nSuite 4: Instant P1 Preemption Workflow");
  const smallCapacityManager = new ViewerCapacityManager({
    maxVideoDecoders: 4, // 4 max decoders for clear testing
    maxAggregateBitrateMbps: 20,
    maxPixelsPerSecond: 100_000_000,
  });

  // Fill all 4 decoder slots with normal P3/P4 streams
  await smallCapacityManager.admit({ ...baseCandidate, cameraId: "cam-p4-a", priority: "P4", visible: true });
  await smallCapacityManager.admit({ ...baseCandidate, cameraId: "cam-p4-b", priority: "P4", visible: true });
  await smallCapacityManager.admit({ ...baseCandidate, cameraId: "cam-p4-c", priority: "P4", visible: true });
  await smallCapacityManager.admit({ ...baseCandidate, cameraId: "cam-pinned", priority: "P3", visible: true, pinned: true });

  assert(smallCapacityManager.getCapacity().activeDecoders === 4, "Capacity reached 4/4 active decoders");

  // Critical alarm appears on CAM07 (P1)
  const p1Candidate: StreamCandidate = {
    cameraId: "CAM07",
    branchId: "branch-178",
    priority: "P1",
    requestedQuality: "GRID",
    stream: { ...subStream, cameraId: "CAM07" },
    visible: true,
    selected: false,
    alarmActive: true,
    alertSeverity: "CRITICAL",
    pinned: false,
  };

  const admitResult = await smallCapacityManager.admit(p1Candidate);
  assert(admitResult.success === true, "P1 stream successfully admitted despite full capacity");
  assert(admitResult.allocatedDecoder === true, "P1 stream allocated active video decoder");
  assert(admitResult.evictedCameraIds?.length === 1, "Exactly one low-priority stream was evicted");
  assert(admitResult.evictedCameraIds?.[0] !== "cam-pinned", "Pinned stream was protected from eviction");
  assert(smallCapacityManager.getCapacity().activeDecoders === 4, "Total decoders remains bounded at 4");

  // 5. Adaptive Degradation Ladder
  console.log("\nSuite 5: Adaptive Degradation Ladder");
  const mainDegraded = getNextDegradedProfile(mainStream, "MAIN_LIVE");
  assert(mainDegraded?.nextState === "SUB_LIVE" && mainDegraded.profile.streamType === "SUB", "MAIN_LIVE degrades to SUB_LIVE");

  const subDegraded = getNextDegradedProfile(subStream, "SUB_LIVE");
  assert(subDegraded?.nextState === "LOW_FPS" && subDegraded.profile.fps === 4, "SUB_LIVE degrades to LOW_FPS (4 FPS)");

  const lowFpsDegraded = getNextDegradedProfile(subStream, "LOW_FPS");
  assert(lowFpsDegraded?.nextState === "THUMBNAIL" && lowFpsDegraded.profile.fps === 1, "LOW_FPS degrades to THUMBNAIL (1 FPS)");

  // 6. Multi-Branch Fairness Policy
  console.log("\nSuite 6: Multi-Branch Fairness Policy");
  const branchCandidates: StreamCandidate[] = [
    // 6 normal streams from branch-01 (policy allows max 4)
    ...Array.from({ length: 6 }, (_, i) => ({
      ...baseCandidate,
      cameraId: `b1-cam-${i + 1}`,
      branchId: "branch-01",
    })),
    // 2 critical streams from branch-01 (unrestricted)
    {
      ...baseCandidate,
      cameraId: "b1-cam-crit-1",
      branchId: "branch-01",
      alertSeverity: "CRITICAL" as const,
      priority: "P1" as const,
    },
    {
      ...baseCandidate,
      cameraId: "b1-cam-crit-2",
      branchId: "branch-01",
      alertSeverity: "CRITICAL" as const,
      priority: "P1" as const,
    },
  ];

  const fairList = filterByFairnessPolicy(branchCandidates, {
    maxNormalStreamsPerBranch: 4,
    maxAlarmStreamsPerBranch: 16,
  });

  const b1NormalCount = fairList.filter((c) => c.alertSeverity !== "CRITICAL").length;
  const b1CritCount = fairList.filter((c) => c.alertSeverity === "CRITICAL").length;

  assert(b1NormalCount === 4, "Branch-01 normal streams capped at 4 (fairness enforced)");
  assert(b1CritCount === 2, "Branch-01 critical alarms bypass normal quota");

  // 7. Telemetry & Dynamic Hysteresis Adjustments
  console.log("\nSuite 7: Playback Telemetry & Dynamic Hysteresis Adjustments");
  const perfMonitor = new PerformanceMonitor();

  // Low drop scenario
  perfMonitor.recordSample({ cameraId: "c1", totalVideoFrames: 1000, droppedVideoFrames: 5 });
  const lowSnap = perfMonitor.getSnapshot(36);
  assert(lowSnap.pressure === "LOW", "0.5% drop ratio classified as LOW pressure");

  // Critical drop scenario
  perfMonitor.reset();
  perfMonitor.recordSample({ cameraId: "c2", totalVideoFrames: 1000, droppedVideoFrames: 250 });
  const critSnap = perfMonitor.getSnapshot(36);
  assert(critSnap.pressure === "CRITICAL", "25% drop ratio classified as CRITICAL pressure");

  // 8. 144-Position Video Wall Reconciliation End-to-End
  console.log("\nSuite 8: 144-Position Video Wall Reconciliation End-to-End");
  const wall144Manager = new ViewerCapacityManager({
    maxVideoDecoders: 36,
    maxAggregateBitrateMbps: 40,
    maxPixelsPerSecond: 200_000_000,
  });

  const candidates144: StreamCandidate[] = Array.from({ length: 144 }, (_, i) => ({
    cameraId: `CAM-${String(i + 1).padStart(3, "0")}`,
    branchId: `BR-${Math.floor(i / 16) + 1}`,
    priority: (i === 0 ? "P0" : i === 7 ? "P1" : i < 36 ? "P3" : "P4") as any,
    requestedQuality: i === 0 ? "FOCUSED" : "GRID",
    stream: i === 0 ? { ...mainStream, cameraId: "CAM-001" } : { ...subStream, cameraId: `CAM-${String(i + 1).padStart(3, "0")}` },
    visible: i < 48,
    selected: i === 0,
    alarmActive: i === 7,
    alertSeverity: i === 7 ? ("CRITICAL" as const) : undefined,
    pinned: i === 1,
  }));

  const { allocations, telemetry } = await wall144Manager.rebalance(candidates144);

  assert(allocations.size === 144, "Reconciled all 144 camera tile positions");
  assert(telemetry.activeStreams <= 36, `Active decoders bounded to machine capacity (${telemetry.activeStreams} / 36)`);

  const cam001State = allocations.get("CAM-001");
  assert(cam001State?.presentation === "LIVE" && cam001State.streamQuality === "MAIN", "Selected CAM-001 allocated 1080p Main Live Stream");

  const cam008State = allocations.get("CAM-008");
  assert(cam008State?.presentation === "LIVE" && cam008State.priority === "P1", "Critical Alert CAM-008 allocated Live Stream");

  const cam140State = allocations.get("CAM-140");
  assert(cam140State?.presentation === "ROTATING" || cam140State?.presentation === "SNAPSHOT", "Unallocated CAM-140 operates in SNAPSHOT/ROTATING mode without decoding overhead");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runViewerCapacityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
