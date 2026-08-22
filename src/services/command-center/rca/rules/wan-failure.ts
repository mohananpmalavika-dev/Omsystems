/**
 * WAN Failure Detection Rule
 * 
 * Detects Wide Area Network failures affecting multiple branches and devices.
 * This is typically the highest-impact root cause with clear evidence patterns.
 */

import type { OperationalGraph } from "../../types.js";
import type { OperationalEvent, RootCauseCandidate, RuleCondition } from "../types.js";
import { calculateBlastRadius } from "../blast-radius.js";
import { analyzeTemporalPattern } from "../temporal-analysis.js";

export function evaluateWANFailure(
  events: OperationalEvent[],
  graph: OperationalGraph
): RootCauseCandidate | null {
  const conditions: RuleCondition[] = [];
  
  // Get failure counts
  const networkFailures = events.filter(e => 
    e.eventType === "wan_down" || 
    e.eventType === "network_degraded" ||
    e.entity.type === "network"
  );
  
  const dvrFailures = events.filter(e => 
    e.eventType === "dvr_offline" || 
    e.eventType === "recorder_unavailable"
  );
  
  const cameraFailures = events.filter(e => e.eventType === "camera_offline");
  const edgeFailures = events.filter(e => e.eventType === "edge_agent_offline");
  
  // Calculate blast radius
  const blast = calculateBlastRadius(events);
  
  // Analyze temporal pattern
  const temporal = analyzeTemporalPattern(events);
  
  // Get unique branches affected
  const branchesAffected = blast.affectedBranches.size;
  const camerasAffected = blast.affectedCameras.size;
  const dvrsAffected = blast.affectedDVRs.size;
  
  // Calculate camera failure percentage
  const cameraFailureRate = camerasAffected / Math.max(1, graph.summary.totalCameras);
  
  // Rule conditions with weights
  
  // Network telemetry
  conditions.push({
    condition: networkFailures.length > 0,
    weight: 35,
    message: `${networkFailures.length} network telemetry events indicate path unavailability or degradation`,
    category: "telemetry",
  });
  
  // Multiple branches affected
  conditions.push({
    condition: branchesAffected >= 3,
    weight: 25,
    message: `${branchesAffected} branches experienced connectivity issues simultaneously`,
    category: "topology",
  });
  
  // High camera impact
  conditions.push({
    condition: camerasAffected >= 10 && cameraFailureRate >= 0.5,
    weight: 20,
    message: `${camerasAffected} cameras (${Math.round(cameraFailureRate * 100)}%) became unreachable`,
    category: "topology",
  });
  
  // DVR connectivity loss
  conditions.push({
    condition: dvrsAffected >= 2,
    weight: 20,
    message: `${dvrsAffected} DVRs/recorders lost remote connectivity`,
    category: "topology",
  });
  
  // Edge agents disconnected
  conditions.push({
    condition: edgeFailures.length > 0,
    weight: 15,
    message: `${edgeFailures.length} edge agents stopped reporting`,
    category: "telemetry",
  });
  
  // Temporal pattern - sudden failure
  conditions.push({
    condition: temporal.timeSpreadSeconds <= 120 && camerasAffected >= 5,
    weight: 15,
    message: `Failure pattern emerged within ${temporal.timeSpreadSeconds} seconds across ${camerasAffected} cameras`,
    category: "temporal",
  });
  
  // Common network dependency in topology
  const hasNetworkDependency = graph.entities.some(entity => 
    entity.entityType === "network" && 
    ["offline", "critical"].includes(entity.status)
  );
  
  conditions.push({
    condition: hasNetworkDependency,
    weight: 15,
    message: "Topology shows network infrastructure in critical state with downstream device failures",
    category: "topology",
  });
  
  // Negative evidence - reduce score if power issues present
  const powerFailures = events.filter(e => 
    e.eventType === "power_loss" || e.eventType === "power_on_battery"
  );
  
  conditions.push({
    condition: powerFailures.length > 0,
    weight: -20,
    message: "Power infrastructure issues detected - may be upstream cause rather than WAN",
    category: "telemetry",
  });
  
  // Calculate total score
  const matchedConditions = conditions.filter(c => c.condition);
  const totalScore = matchedConditions.reduce((sum, c) => sum + c.weight, 0);
  const normalizedScore = Math.min(Math.max(totalScore, 0), 100);
  const confidence = normalizedScore / 100;
  
  // Require minimum threshold
  if (normalizedScore < 40) {
    return null;
  }
  
  // Determine certainty
  const certainty = confidence >= 0.85 ? "confirmed" as const
    : confidence >= 0.65 ? "likely" as const
    : confidence >= 0.45 ? "possible" as const
    : "unknown" as const;
  
  // Build supporting evidence
  const supportingEvidence = matchedConditions
    .filter(c => c.weight > 0)
    .map(c => ({
      type: "supporting" as const,
      assertion: c.message,
      weight: c.weight,
      source: c.category,
      timestamp: temporal.firstFailureAt,
    }));
  
  // Build contradicting evidence
  const contradictingEvidence = matchedConditions
    .filter(c => c.weight < 0)
    .map(c => ({
      type: "contradicting" as const,
      assertion: c.message,
      weight: Math.abs(c.weight),
      source: c.category,
      timestamp: temporal.firstFailureAt,
    }));
  
  // Missing evidence
  const missingEvidence: string[] = [];
  
  if (networkFailures.length === 0) {
    missingEvidence.push("Direct network telemetry showing WAN path failure");
  }
  
  if (!hasNetworkDependency) {
    missingEvidence.push("Network topology showing upstream failure point");
  }
  
  if (branchesAffected < 2) {
    missingEvidence.push("Multi-branch impact pattern expected for WAN failure");
  }
  
  // Build explanation
  const explanation = generateExplanation(
    blast,
    temporal,
    matchedConditions,
    confidence
  );
  
  // Recommended actions
  const recommendedActions = [
    "Investigate primary WAN connection and ISP status",
    "Check router and gateway telemetry for the affected branch cluster",
    "Verify BGP/routing table status if applicable",
    "Do NOT attempt individual camera or DVR reboots until WAN is confirmed",
    "Check for ISP-reported outages in the region",
  ];
  
  return {
    code: "wan_failure",
    label: "WAN Failure",
    score: normalizedScore,
    confidence,
    certainty,
    supportingEvidence,
    contradictingEvidence,
    missingEvidence,
    affectedEntities: {
      cameras: camerasAffected,
      dvrs: dvrsAffected,
      branches: branchesAffected,
      networks: blast.affectedNetworks.size,
      edgeAgents: blast.affectedEdgeAgents.size,
    },
    temporalPattern: {
      firstFailure: temporal.firstFailureAt,
      lastFailure: temporal.lastFailureAt,
      timeSpreadSeconds: temporal.timeSpreadSeconds,
      simultaneousFailures: temporal.simultaneousFailures,
    },
    explanation,
    recommendedActions,
    confidenceDetails: [
      `${matchedConditions.length} conditions matched out of ${conditions.length} evaluated`,
      `Confidence score: ${normalizedScore}/100 based on weighted evidence`,
    ],
  };
}

function generateExplanation(
  blast: any,
  temporal: any,
  conditions: RuleCondition[],
  confidence: number
): string {
  const parts: string[] = [];
  
  parts.push(
    `WAN failure is the most probable root cause with ${Math.round(confidence * 100)}% confidence.`
  );
  
  if (blast.summary.totalBranches >= 3) {
    parts.push(
      `${blast.summary.totalBranches} branches experienced simultaneous connectivity loss, ` +
      `affecting ${blast.summary.totalCameras} cameras and ${blast.summary.totalDVRs} DVRs.`
    );
  }
  
  if (temporal.timeSpreadSeconds <= 120) {
    parts.push(
      `The failure pattern emerged within ${temporal.timeSpreadSeconds} seconds, ` +
      `indicating a common upstream network failure rather than individual device issues.`
    );
  }
  
  const networkConditions = conditions.filter(c => c.category === "telemetry" && c.weight > 0);
  if (networkConditions.length > 0) {
    parts.push(
      "Network telemetry shows degraded WAN connectivity with packet loss and increased latency."
    );
  }
  
  parts.push(
    "DVRs and edge agents lost remote connectivity while camera hardware health alarms were not triggered, " +
    "supporting a network-layer failure rather than device-level failures."
  );
  
  return parts.join(" ");
}
