/**
 * Digital Twin Capability Integration
 * 
 * Extends the Digital Twin with device capabilities to create
 * an infrastructure intelligence layer.
 */

import type {
  DeviceCapabilitySet,
  Capability,
  CapabilityKey,
  CapabilityState,
  EffectiveCapability,
} from "../device-capabilities/index.js";
import type { TwinObject, TwinObjectStatus, TwinDeviceType } from "./types.js";

/**
 * Twin node with capabilities.
 */
export interface TwinNodeWithCapabilities extends TwinObject {
  capabilities?: DeviceCapabilitySet;
  effectiveCapabilities?: Map<CapabilityKey, EffectiveCapability>;
}

/**
 * Capability-enhanced twin status.
 */
export interface CapabilityAwareTwinStatus extends TwinObjectStatus {
  capabilitySummary?: {
    total: number;
    supported: number;
    unavailable: number;
    degraded: number;
    unknown: number;
    lastChecked: string;
  };
  criticalCapabilities?: Array<{
    capability: CapabilityKey;
    state: CapabilityState;
    available: boolean;
    reason?: string;
  }>;
}

/**
 * Twin graph node types.
 */
export type TwinNodeType =
  | "ENTERPRISE"
  | "REGION"
  | "BRANCH"
  | "SITE"
  | "ISP"
  | "ROUTER"
  | "SWITCH"
  | "VLAN"
  | "NVR"
  | "DVR"
  | "STORAGE"
  | "CHANNEL"
  | "CAMERA"
  | "STREAM"
  | "EDGE_AGENT"
  | "SERVER"
  | "ANALYTICS_SERVICE";

/**
 * Twin graph node.
 */
export interface TwinGraphNode {
  id: string;
  tenantId: string;
  type: TwinNodeType;
  name: string;
  state: TwinNodeState;
  metadata: Record<string, unknown>;
  capabilities?: DeviceCapabilitySet;
}

/**
 * Twin node state (derived from health + capabilities).
 */
export interface TwinNodeState {
  operational: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
  connectivity: "ONLINE" | "OFFLINE" | "PARTIAL" | "UNKNOWN";
  security: "HEALTHY" | "AT_RISK" | "UNKNOWN";
  confidence: number;
  observedAt: Date;
  reasons: TwinStateReason[];
}

export interface TwinStateReason {
  category: "capability" | "health" | "connectivity" | "security";
  severity: "info" | "warning" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Twin graph edge (relationship).
 */
export type TwinRelationType =
  | "CONTAINS"
  | "CONNECTED_TO"
  | "POWERED_BY"
  | "ROUTED_THROUGH"
  | "RECORDED_BY"
  | "STORED_ON"
  | "STREAMS_TO"
  | "MANAGED_BY"
  | "MONITORED_BY"
  | "DEPENDS_ON"
  | "FAILOVER_TO"
  | "ANALYZED_BY";

export interface TwinGraphEdge {
  from: string;
  to: string;
  relation: TwinRelationType;
  metadata?: Record<string, unknown>;
}

/**
 * Complete twin graph.
 */
export interface TwinGraph {
  nodes: Map<string, TwinGraphNode>;
  edges: TwinGraphEdge[];
}

/**
 * Dependency chain for a node.
 */
export interface DependencyChain {
  node: TwinGraphNode;
  dependencies: Array<{
    node: TwinGraphNode;
    relation: TwinRelationType;
    depth: number;
  }>;
}

/**
 * Blast radius calculation result.
 */
export interface BlastRadiusResult {
  affectedNode: TwinGraphNode;
  directlyAffected: TwinGraphNode[];
  indirectlyAffected: TwinGraphNode[];
  impactedCapabilities: Array<{
    deviceId: string;
    capability: CapabilityKey;
    currentState: CapabilityState;
    projectedState: CapabilityState;
    reason: string;
  }>;
  estimatedDowntime?: string;
  criticalServices: string[];
}

/**
 * Helper to map device type to twin node type.
 */
export function mapDeviceTypeToNodeType(deviceType: TwinDeviceType): TwinNodeType {
  const mapping: Record<TwinDeviceType, TwinNodeType> = {
    camera: "CAMERA",
    recorder: "NVR",
    door: "CAMERA", // Doors often have associated cameras
    access_control: "CAMERA",
    sensor: "CAMERA",
    ups: "SERVER",
    network: "SWITCH",
    disk: "STORAGE",
    equipment: "SERVER",
  };

  return mapping[deviceType] || "CAMERA";
}

/**
 * Derive twin node state from capabilities and health.
 */
export function deriveTwinNodeState(
  capabilities?: DeviceCapabilitySet,
  healthData?: any,
): TwinNodeState {
  const reasons: TwinStateReason[] = [];
  let operational: TwinNodeState["operational"] = "HEALTHY";
  let connectivity: TwinNodeState["connectivity"] = "ONLINE";
  let security: TwinNodeState["security"] = "HEALTHY";
  let confidence = 1.0;

  // Analyze capabilities
  if (capabilities) {
    const capSummary = summarizeCapabilities(capabilities);

    if (capSummary.failed > 0 || capSummary.unavailable > capSummary.total * 0.5) {
      operational = "FAILED";
      reasons.push({
        category: "capability",
        severity: "critical",
        message: `${capSummary.failed + capSummary.unavailable} capabilities unavailable`,
      });
    } else if (capSummary.degraded > 0 || capSummary.unavailable > 0) {
      operational = "DEGRADED";
      reasons.push({
        category: "capability",
        severity: "warning",
        message: `${capSummary.degraded + capSummary.unavailable} capabilities degraded`,
      });
    }

    // Check connectivity capabilities
    if (
      !isCapabilityAvailable(capabilities.network?.rtsp) &&
      !isCapabilityAvailable(capabilities.network?.onvif?.core)
    ) {
      connectivity = "OFFLINE";
      reasons.push({
        category: "connectivity",
        severity: "critical",
        message: "Network connectivity unavailable",
      });
    } else if (
      capabilities.network?.rtsp?.state === "DEGRADED" ||
      capabilities.network?.onvif?.core?.state === "DEGRADED"
    ) {
      connectivity = "PARTIAL";
      reasons.push({
        category: "connectivity",
        severity: "warning",
        message: "Network connectivity degraded",
      });
    }

    // Check security capabilities
    if (capabilities.security) {
      const secUnavailable =
        !isCapabilityAvailable(capabilities.security.https) ||
        capabilities.security.secureBoot?.state === "UNKNOWN";

      if (secUnavailable) {
        security = "AT_RISK";
        reasons.push({
          category: "security",
          severity: "warning",
          message: "Security capabilities unavailable or unknown",
        });
      }
    }

    confidence = capSummary.averageConfidence;
  }

  // Incorporate health data
  if (healthData) {
    if (healthData.status === "offline") {
      operational = "FAILED";
      connectivity = "OFFLINE";
      reasons.push({
        category: "health",
        severity: "critical",
        message: "Device offline",
      });
    }
  }

  return {
    operational,
    connectivity,
    security,
    confidence,
    observedAt: new Date(),
    reasons,
  };
}

/**
 * Summarize capabilities for quick assessment.
 */
function summarizeCapabilities(capabilities: DeviceCapabilitySet): {
  total: number;
  supported: number;
  unavailable: number;
  degraded: number;
  failed: number;
  unknown: number;
  averageConfidence: number;
} {
  let total = 0;
  let supported = 0;
  let unavailable = 0;
  let degraded = 0;
  let failed = 0;
  let unknown = 0;
  let totalConfidence = 0;

  function traverse(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    if ("state" in obj && "available" in obj && "confidence" in obj) {
      const cap = obj as Capability;
      total++;
      totalConfidence += cap.confidence;

      if (cap.state === "SUPPORTED" && cap.available) {
        supported++;
      } else if (cap.state === "UNAVAILABLE" || !cap.available) {
        unavailable++;
      } else if (cap.state === "DEGRADED") {
        degraded++;
      } else if (cap.state === "UNSUPPORTED") {
        failed++;
      } else {
        unknown++;
      }
    } else {
      for (const value of Object.values(obj)) {
        traverse(value);
      }
    }
  }

  traverse(capabilities);

  return {
    total,
    supported,
    unavailable,
    degraded,
    failed,
    unknown,
    averageConfidence: total > 0 ? totalConfidence / total : 0,
  };
}

/**
 * Check if a capability is available.
 */
function isCapabilityAvailable(capability?: Capability): boolean {
  return capability?.state === "SUPPORTED" && capability.available === true;
}

/**
 * Enhance twin object status with capability information.
 */
export function enhanceTwinStatusWithCapabilities(
  status: TwinObjectStatus,
  capabilities?: DeviceCapabilitySet,
): CapabilityAwareTwinStatus {
  if (!capabilities) {
    return status;
  }

  const summary = summarizeCapabilities(capabilities);

  // Identify critical capabilities that are not available
  const criticalCapabilities: CapabilityAwareTwinStatus["criticalCapabilities"] = [];

  // Check critical capabilities
  const criticalCaps: Array<[CapabilityKey, Capability | undefined]> = [
    ["video.liveVideo", capabilities.video?.liveVideo],
    ["recording.recording", capabilities.recording?.recording],
    ["network.rtsp", capabilities.network?.rtsp],
  ];

  for (const [key, cap] of criticalCaps) {
    if (cap && (!cap.available || cap.state !== "SUPPORTED")) {
      criticalCapabilities.push({
        capability: key,
        state: cap.state,
        available: cap.available,
        reason: cap.limitations?.join("; "),
      });
    }
  }

  return {
    ...status,
    capabilitySummary: {
      total: summary.total,
      supported: summary.supported,
      unavailable: summary.unavailable,
      degraded: summary.degraded,
      unknown: summary.unknown,
      lastChecked: capabilities.lastUpdatedAt.toISOString(),
    },
    criticalCapabilities:
      criticalCapabilities.length > 0 ? criticalCapabilities : undefined,
  };
}

/**
 * Calculate effective capability considering dependencies.
 */
export function calculateEffectiveCapability(
  deviceCapability: Capability,
  dependencies: DependencyChain,
): EffectiveCapability {
  // Check if any dependency is failed
  const failedDep = dependencies.dependencies.find(
    (dep) => dep.node.state.operational === "FAILED",
  );

  if (failedDep) {
    return {
      deviceSupport: deviceCapability.state,
      platformSupport: "SUPPORTED",
      effectiveState: "UNAVAILABLE",
      effectivelyAvailable: false,
      unavailabilityReason: `Dependency ${failedDep.node.name} is unavailable`,
      dependencies: dependencies.dependencies.map((dep) => ({
        nodeId: dep.node.id,
        nodeType: dep.node.type,
        state: dep.node.state.operational,
      })),
    };
  }

  // Check for degraded dependencies
  const degradedDep = dependencies.dependencies.find(
    (dep) => dep.node.state.operational === "DEGRADED",
  );

  if (degradedDep) {
    return {
      deviceSupport: deviceCapability.state,
      platformSupport: "SUPPORTED",
      effectiveState: "DEGRADED",
      effectivelyAvailable: true,
      unavailabilityReason: `Dependency ${degradedDep.node.name} is degraded`,
      dependencies: dependencies.dependencies.map((dep) => ({
        nodeId: dep.node.id,
        nodeType: dep.node.type,
        state: dep.node.state.operational,
      })),
    };
  }

  // All dependencies healthy
  return {
    deviceSupport: deviceCapability.state,
    platformSupport: "SUPPORTED",
    effectiveState: deviceCapability.state,
    effectivelyAvailable: deviceCapability.available,
    dependencies: dependencies.dependencies.map((dep) => ({
      nodeId: dep.node.id,
      nodeType: dep.node.type,
      state: dep.node.state.operational,
    })),
  };
}
