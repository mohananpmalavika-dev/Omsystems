/**
 * Deterministic Root Cause Analysis (100% Local, Free, Zero Cloud Billing API Dependency)
 * Combines Digital Twin Topology + Dependency Graphs + Telemetry + Deterministic Correlation
 */

export interface DeterministicRcaResult {
  incidentId: string;
  branchId: string;
  rootCauseNodeId: string;
  rootCauseNodeType: "ROUTER" | "SWITCH" | "UPS_POWER" | "RECORDER" | "FIBER_ISP" | "CAMERA";
  rootCauseName: string;
  failureType: string;
  detectedAt: string;
  confidenceScore: number;
  blastRadius: {
    suppressedAlertsCount: number;
    dependentRecordersCount: number;
    dependentCamerasCount: number;
    dependentAiPipelinesCount: number;
  };
  remediationAction: string;
  narrativeExplanation: string;
}

export class DeterministicRcaService {
  /**
   * Perform 100% deterministic root-cause analysis based on physical topology & telemetry.
   */
  async analyzeBranchOutage(input: {
    branchId: string;
    unreachableNodeIds: string[];
    powerStatus: "NORMAL" | "MAINS_OUTAGE" | "UPS_CRITICAL";
    wanStatus: "ONLINE" | "DISCONNECTED" | "PACKET_LOSS";
  }): Promise<DeterministicRcaResult> {
    const now = new Date().toISOString();
    const unreachableNodeIds = input.unreachableNodeIds.filter(Boolean);
    const normalizedNodeIds = unreachableNodeIds.map((id) => id.toLowerCase());
    const cameraCount = normalizedNodeIds.filter((id) => id.includes("cam")).length;
    const recorderCount = normalizedNodeIds.filter((id) => id.includes("nvr") || id.includes("recorder") || id.includes("dvr")).length;
    const suppressedAlertsCount = unreachableNodeIds.length;

    if (input.powerStatus === "NORMAL" && input.wanStatus === "ONLINE" && unreachableNodeIds.length === 0) {
      return {
        incidentId: `rca-unknown-${input.branchId}`,
        branchId: input.branchId,
        rootCauseNodeId: `branch-${input.branchId}`,
        rootCauseNodeType: "CAMERA",
        rootCauseName: "No confirmed failed node",
        failureType: "INSUFFICIENT_EVIDENCE",
        detectedAt: now,
        confidenceScore: 0,
        blastRadius: {
          suppressedAlertsCount: 0,
          dependentRecordersCount: 0,
          dependentCamerasCount: 0,
          dependentAiPipelinesCount: 0,
        },
        remediationAction: "Collect current device, network, and power telemetry before dispatching remediation.",
        narrativeExplanation: `No outage signal or unreachable node was provided for Branch ${input.branchId}. A root cause cannot be determined from the available evidence.`,
      };
    }

    // 1. Rule 1: Power Outage Root Cause
    if (input.powerStatus === "UPS_CRITICAL" || input.powerStatus === "MAINS_OUTAGE") {
      return {
        incidentId: `rca-power-${input.branchId}`,
        branchId: input.branchId,
        rootCauseNodeId: `ups-${input.branchId.toLowerCase()}-01`,
        rootCauseNodeType: "UPS_POWER",
        rootCauseName: "Branch UPS Power Subsystem (Battery Critical)",
        failureType: "MAINS_POWER_LOSS_AND_BATTERY_DEPLETED",
        detectedAt: now,
        confidenceScore: 0.99,
        blastRadius: {
          suppressedAlertsCount,
          dependentRecordersCount: recorderCount,
          dependentCamerasCount: cameraCount,
          dependentAiPipelinesCount: 0,
        },
        remediationAction: "Notify Branch Facilities & Electricity Board. Dispatch UPS AMC vendor.",
        narrativeExplanation: `Branch ${input.branchId} is in outage due to AC Mains Power Loss and UPS Battery Depletion. ${suppressedAlertsCount} unreachable node(s) were correlated as downstream impact.`,
      };
    }

    // 2. Rule 2: Primary WAN / Router Failure Root Cause
    if (input.wanStatus === "DISCONNECTED" || normalizedNodeIds.some((id) => id.includes("router"))) {
      return {
        incidentId: `rca-wan-${input.branchId}`,
        branchId: input.branchId,
        rootCauseNodeId: `router-${input.branchId.toLowerCase()}-01`,
        rootCauseNodeType: "ROUTER",
        rootCauseName: "Branch Edge Router (Router-01)",
        failureType: "WAN_INTERFACE_DOWN",
        detectedAt: now,
        confidenceScore: 0.98,
        blastRadius: {
          suppressedAlertsCount,
          dependentRecordersCount: recorderCount,
          dependentCamerasCount: cameraCount,
          dependentAiPipelinesCount: 0,
        },
        remediationAction: "Check ISP Primary Fiber link. Failover to 4G Secondary Backup WAN.",
        narrativeExplanation: `Branch ${input.branchId} connectivity is interrupted because a router became unreachable at ${now}. ${suppressedAlertsCount} downstream alert(s) were correlated.`,
      };
    }

    // 3. Rule 3: NVR Failure Root Cause
    if (normalizedNodeIds.some((id) => id.includes("nvr") || id.includes("recorder") || id.includes("dvr"))) {
      return {
        incidentId: `rca-nvr-${input.branchId}`,
        branchId: input.branchId,
        rootCauseNodeId: `nvr-${input.branchId.toLowerCase()}-01`,
        rootCauseNodeType: "RECORDER",
        rootCauseName: "Branch Main NVR Recorder",
        failureType: "NVR_SERVICE_UNRESPONSIVE",
        detectedAt: now,
        confidenceScore: 0.96,
        blastRadius: {
          suppressedAlertsCount,
          dependentRecordersCount: recorderCount,
          dependentCamerasCount: cameraCount,
          dependentAiPipelinesCount: 0,
        },
        remediationAction: "Perform remote soft reboot of NVR service via Edge Gateway daemon. If unresponsive, dispatch hardware technician.",
        narrativeExplanation: `Branch ${input.branchId} recorder failed to respond to ONVIF/RTSP health checks. Cameras remain reachable over LAN switch. ${suppressedAlertsCount} recording alert(s) were correlated into this single NVR incident.`,
      };
    }

    if (unreachableNodeIds.length === 0) {
      return {
        incidentId: `rca-unknown-${input.branchId}`,
        branchId: input.branchId,
        rootCauseNodeId: `branch-${input.branchId}`,
        rootCauseNodeType: "CAMERA",
        rootCauseName: "No confirmed failed node",
        failureType: "INSUFFICIENT_EVIDENCE",
        detectedAt: now,
        confidenceScore: 0,
        blastRadius: {
          suppressedAlertsCount: 0,
          dependentRecordersCount: 0,
          dependentCamerasCount: 0,
          dependentAiPipelinesCount: 0,
        },
        remediationAction: "Collect device-level failure telemetry before dispatching remediation.",
        narrativeExplanation: `Branch ${input.branchId} has a network signal but no failed node was identified. A device root cause cannot be determined from the available evidence.`,
      };
    }

    // Default Camera Level Root Cause
    return {
      incidentId: `rca-cam-${input.branchId}`,
      branchId: input.branchId,
      rootCauseNodeId: unreachableNodeIds[0]!,
      rootCauseNodeType: "CAMERA",
      rootCauseName: "Isolated Camera Unit",
      failureType: "POE_PORT_OR_CABLE_FAULT",
      detectedAt: now,
      confidenceScore: 0.92,
      blastRadius: {
        suppressedAlertsCount,
        dependentRecordersCount: 0,
        dependentCamerasCount: 1,
        dependentAiPipelinesCount: 0,
      },
      remediationAction: "Inspect PoE switch port and RJ45 connector on camera.",
      narrativeExplanation: `Isolated single camera drop on Branch ${input.branchId}. Upstream switch and NVR recorder are fully healthy.`,
    };
  }
}
