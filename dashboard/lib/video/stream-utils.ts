/**
 * Stream Utilities
 * 
 * Calculate stream costs, priorities, and resource requirements
 */

import type {
  StreamProfile,
  StreamCost,
  CameraContext,
  CameraPriorityClass,
  VideoCodec,
  ViewerCapacity,
  ViewerResourceBudget,
} from "./types";

// ============================================================================
// STREAM COST CALCULATION
// ============================================================================

/**
 * Calculate the resource cost of a stream
 */
export function calculateStreamCost(
  stream: StreamProfile,
  viewerCapacity?: ViewerCapacity
): StreamCost {
  const baseDecoderUnits = 1.0;
  
  // Codec penalty (H265 requires more CPU if no HW acceleration)
  let codecMultiplier = 1.0;
  if (viewerCapacity?.hardwareAcceleration !== "AVAILABLE") {
    if (stream.codec === "H265") {
      codecMultiplier = 1.3;
    } else if (stream.codec === "AV1") {
      codecMultiplier = 1.8;
    }
  }
  
  // Resolution penalty (4K costs more than 720p)
  const pixelCount = stream.width * stream.height;
  let resolutionMultiplier = 1.0;
  if (pixelCount > 1920 * 1080) {
    resolutionMultiplier = 2.0; // 4K+
  } else if (pixelCount > 1280 * 720) {
    resolutionMultiplier = 1.5; // 1080p
  }
  
  const decoderUnits = baseDecoderUnits * codecMultiplier * resolutionMultiplier;
  
  return {
    decoderUnits,
    bitrateMbps: stream.estimatedBitrateKbps / 1000,
    pixelsPerSecond: stream.width * stream.height * stream.fps,
  };
}

// ============================================================================
// CAMERA PRIORITY SCORING
// ============================================================================

/**
 * Score a camera for priority scheduling
 * Higher score = higher priority
 */
export function scoreCamera(camera: CameraContext): number {
  let score = 0;

  // P0: Operator control (highest priority)
  if (camera.operatorPinned) {
    score += 100000;
  }
  if (camera.operatorSelected) {
    score += 50000;
  }

  // P1: Critical alerts
  if (camera.hasCriticalAlert) {
    score += 9000;
  }

  // P2: High severity
  if (camera.hasHighAlert) {
    score += 7000;
  }

  // P3: Active incident
  if (camera.incidentActive) {
    score += 6000;
  }

  // P4: Visible in viewport
  if (camera.isVisible) {
    score += 3000;
  }

  // P5: Branch selected
  if (camera.branchSelected) {
    score += 2000;
  }

  // P6: Rotational due
  if (camera.isRotationallyDue) {
    score += 1000;
  }

  return score;
}

/**
 * Determine priority class from camera context
 */
export function getCameraPriorityClass(
  camera: CameraContext
): CameraPriorityClass {
  if (camera.operatorPinned || camera.operatorSelected) {
    return "P0_OPERATOR_PINNED";
  }
  
  if (camera.hasCriticalAlert) {
    return "P1_CRITICAL";
  }
  
  if (camera.hasHighAlert) {
    return "P2_HIGH";
  }
  
  if (camera.incidentActive) {
    return "P3_INCIDENT";
  }
  
  if (camera.isVisible) {
    return "P4_VISIBLE";
  }
  
  if (camera.isRotationallyDue) {
    return "P5_ROTATION";
  }
  
  return "P6_BACKGROUND";
}

/**
 * Priority class numeric value for comparison
 */
export function getPriorityValue(priorityClass: CameraPriorityClass): number {
  const priorityMap: Record<CameraPriorityClass, number> = {
    P0_OPERATOR_PINNED: 100,
    P1_CRITICAL: 90,
    P2_HIGH: 70,
    P3_INCIDENT: 60,
    P4_VISIBLE: 40,
    P5_ROTATION: 20,
    P6_BACKGROUND: 10,
  };
  return priorityMap[priorityClass];
}

// ============================================================================
// ADMISSION CONTROL
// ============================================================================

/**
 * Check if a stream can be admitted given current budget
 */
export function canAdmitStream(
  streamCost: StreamCost,
  budget: ViewerResourceBudget
): boolean {
  return (
    budget.decoderUsage + streamCost.decoderUnits <= budget.decoderBudget &&
    budget.bitrateUsageMbps + streamCost.bitrateMbps <= budget.bitrateBudgetMbps &&
    budget.pixelsPerSecondUsage + streamCost.pixelsPerSecond <= budget.pixelsPerSecondBudget
  );
}

/**
 * Check if admission is possible in emergency pool
 */
export function canAdmitToEmergencyPool(
  streamCost: StreamCost,
  budget: ViewerResourceBudget,
  currentEmergencyUsage: number
): boolean {
  const totalAvailable = budget.decoderBudget;
  const emergencyLimit = budget.emergencyReserve;
  const remainingEmergency = emergencyLimit - currentEmergencyUsage;
  
  return (
    remainingEmergency >= streamCost.decoderUnits &&
    budget.bitrateUsageMbps + streamCost.bitrateMbps <= budget.bitrateBudgetMbps &&
    budget.pixelsPerSecondUsage + streamCost.pixelsPerSecond <= budget.pixelsPerSecondBudget
  );
}

/**
 * Consume budget for a stream
 */
export function consumeBudget(
  budget: ViewerResourceBudget,
  cost: StreamCost
): ViewerResourceBudget {
  return {
    ...budget,
    decoderUsage: budget.decoderUsage + cost.decoderUnits,
    bitrateUsageMbps: budget.bitrateUsageMbps + cost.bitrateMbps,
    pixelsPerSecondUsage: budget.pixelsPerSecondUsage + cost.pixelsPerSecond,
  };
}

/**
 * Release budget from a stream
 */
export function releaseBudget(
  budget: ViewerResourceBudget,
  cost: StreamCost
): ViewerResourceBudget {
  return {
    ...budget,
    decoderUsage: Math.max(0, budget.decoderUsage - cost.decoderUnits),
    bitrateUsageMbps: Math.max(0, budget.bitrateUsageMbps - cost.bitrateMbps),
    pixelsPerSecondUsage: Math.max(0, budget.pixelsPerSecondUsage - cost.pixelsPerSecond),
  };
}

// ============================================================================
// STREAM PROFILE SELECTION
// ============================================================================

export interface TileGeometry {
  width: number;
  height: number;
}

/**
 * Choose appropriate stream profile based on tile size
 */
export function chooseStreamProfile(
  camera: CameraContext,
  tile: TileGeometry,
  priorityClass: CameraPriorityClass
): StreamProfile | undefined {
  // P0 (operator focused) always gets main stream if available
  if (priorityClass === "P0_OPERATOR_PINNED" && camera.mainStream) {
    return camera.mainStream;
  }
  
  // Small tiles should use substream
  if (tile.width < 640 || tile.height < 360) {
    return camera.subStream || camera.mainStream;
  }
  
  // Medium tiles (4x4 grid or larger single view)
  if (tile.width >= 640 && tile.height >= 360) {
    // P1/P2 critical cameras can use main if tile is large enough
    if (
      (priorityClass === "P1_CRITICAL" || priorityClass === "P2_HIGH") &&
      tile.width >= 800 &&
      camera.mainStream
    ) {
      return camera.mainStream;
    }
    
    return camera.subStream || camera.mainStream;
  }
  
  return camera.subStream || camera.mainStream;
}

// ============================================================================
// PREEMPTION LOGIC
// ============================================================================

const PREEMPTION_MARGIN = 2000; // Priority score must be this much higher
const PREEMPTION_PROTECTION_MS = 10000; // Normal streams protected for 10s
const ALERT_PROTECTION_MS = 30000; // Alert streams protected for 30s

/**
 * Check if a stream can be preempted by another
 */
export function canPreempt(
  candidatePriority: number,
  candidatePriorityClass: CameraPriorityClass,
  currentPriority: number,
  currentPriorityClass: CameraPriorityClass,
  currentActivatedAt: number,
  now: number
): boolean {
  // P0 cannot be preempted
  if (currentPriorityClass === "P0_OPERATOR_PINNED") {
    return false;
  }
  
  // Check protection window
  const protectionMs = 
    currentPriorityClass === "P1_CRITICAL" || currentPriorityClass === "P2_HIGH"
      ? ALERT_PROTECTION_MS
      : PREEMPTION_PROTECTION_MS;
  
  if (now - currentActivatedAt < protectionMs) {
    // Still in protection window, only higher priority class can preempt
    const candidateValue = getPriorityValue(candidatePriorityClass);
    const currentValue = getPriorityValue(currentPriorityClass);
    return candidateValue > currentValue;
  }
  
  // Outside protection window, require significant priority difference
  return candidatePriority > currentPriority + PREEMPTION_MARGIN;
}

// ============================================================================
// CODEC DETECTION
// ============================================================================

/**
 * Detect supported codecs in browser
 */
export async function detectSupportedCodecs(): Promise<VideoCodec[]> {
  const codecs: VideoCodec[] = [];
  
  if (typeof window === "undefined" || !window.MediaSource) {
    return ["H264", "UNKNOWN"];
  }
  
  // Test common MIME types
  const tests: [VideoCodec, string][] = [
    ["H264", 'video/mp4; codecs="avc1.42E01E"'],
    ["H265", 'video/mp4; codecs="hev1.1.6.L93.B0"'],
    ["AV1", 'video/mp4; codecs="av01.0.05M.08"'],
  ];
  
  for (const [codec, mimeType] of tests) {
    if (MediaSource.isTypeSupported(mimeType)) {
      codecs.push(codec);
    }
  }
  
  if (codecs.length === 0) {
    codecs.push("H264", "UNKNOWN");
  }
  
  return codecs;
}

/**
 * Select preferred codec from supported list
 */
export function selectPreferredCodec(
  supportedCodecs: VideoCodec[],
  hardwareAcceleration: string
): VideoCodec {
  // If HW acceleration available, prefer H265
  if (hardwareAcceleration === "AVAILABLE" && supportedCodecs.includes("H265")) {
    return "H265";
  }
  
  // Default to H264
  if (supportedCodecs.includes("H264")) {
    return "H264";
  }
  
  return supportedCodecs[0] || "H264";
}
