/**
 * DVR/Recorder Failure Detection Rule
 * 
 * Detects DVR/recorder-specific failures that cause downstream camera issues.
 */

import type { OperationalGraph } from "../../types.js";
import type { OperationalEvent, RootCauseCandidate, RuleCondition } from "../types.js";
import { calculateBlastRadius } from "../blast-radius.js";
import { analyzeTemporalPattern } from "../temporal-analysis.js";

export function evaluateDVRFailure(
  events: OperationalEvent[],
  graph: OperationalGraph
): RootCauseCandidate | null {
  const conditions: RuleCondition[] = [];
  
  const dvrFailures = events.filter(e => 
    e.eventType === "dvr_offline" || 
    e.eventType === "recorder_unavailable" ||
    e.eventType === "recorder_degraded"
  );
  
  const cameraFailures = events.filter(e => e.eventType === "camera_offline");
  const networkFailures = events.filter(e => 
    e.eventType === "wan_down" || e.eventType === "network_degraded"
  );
  const powerFailures = events.filter(e => 
    e.eventType === "power_loss" || e.eventType === "power_on_battery"
  );
  const edgeFailures = events.filter(e => e.eventType === "edge_agent_offline");
  
  const blast = calculateBlastRadius(events);
  const temporal = analyzeTemporalPattern(events);
  
  // Rule conditions
  
  // DVR telemetry reports failure
  conditions.push({
    condition: dvrFailures.length > 0,
    weight: 40,
    message: `${dvrFailures.length} DVR/recorder device(s) report unavailable or degraded status`,
    category: "telemetry",
  });
  
  // Connected cameras also affected
  conditions.push({
    condition: cameraFailures.length > 0 && dvrFailures.length > 0,
    weight: 25,
    message: `${cameraFailures.length} cameras affected, consistent with DVR connectivity loss`,
    category: "topology",
  });
  
  // Network remains healthy (rules out WAN failure)
  conditions.push({
    condition: networkFailures.length === 0 && dvrFailures.length > 0,
    weight: 25,
    message: "Network telemetry does not indicate primary WAN outage",
    category: "telemetry",
  });
  
  // Edge agents still reachable (rules out total connectivity loss)
  conditions.push({
    condition: edgeFailures.length === 0 && dvrFailures.length > 0,
    weight: 15,
    message: "Edge agents remain reachable, indicating DVR-specific issue",
    category: "telemetry",
  });
  
  // Topology shows DVR upstream of cameras
  const dvrWithDownstream = graph.dependencies.filter(dep => 
    dep.relationship === "records_to" &&
    blast.affectedDVRs.has(dep.toEntityId.replace("recorder:", ""))
  );
  
  conditions.push({
    condition: dvrWithDownstream.length > 0,
    weight: 20,
    message: `Topology shows ${dvrWithDownstream.length} cameras dependent on failed DVR(s)`,
    category: "topology",
  });
  
  // No power failure (rules out power as root cause)
  conditions.push({
    condition: powerFailures.length === 0,
    weight: 10,
    message: "No power infrastructure failures detected",
    category: "telemetry",
  });
  
  // Limited blast radius (single DVR impact)
  conditions.push({
    condition: blast.summary.totalDVRs <= 2 && blast.summary.totalBranches <= 1,
    weight: 15,
    message: "Limited blast radius consistent with isolated DVR failure",
    category: "topology",
  });
  
  // Negative evidence - widespread failure suggests higher-level cause
  conditions.push({
    condition: blast.summary.totalDVRs >= 5 || blast.summary.totalBranches >= 3,
    weight: -25,
    message: "Widespread impact across multiple DVRs/branches suggests upstream infrastructure failure",
    category: "topology",
  });
  
  const matchedConditions = conditions.filter(c => c.condition);
  const totalScore = matchedConditions.reduce((sum, c) => sum + c.weight, 0);
  const normalizedScore = Math.min(Math.max(totalScore, 0), 100);
  const confidence = normalizedScore / 100;
  
  if (normalizedScore < 35) {
    return null;
  }
  
  const certainty = confidence >= 0.85 ? "confirmed" as const
    : confidence >= 0.65 ? "likely" as const
    : confidence >= 0.45 ? "possible" as const
    : "unknown" as const;
  
  const supportingEvidence = matchedConditions
    .filter(c => c.weight > 0)
    .map(c => ({
      type: "supporting" as const,
      assertion: c.message,
      weight: c.weight,
      source: c.category,
      timestamp: temporal.firstFailureAt,
    }));
  
  const contradictingEvidence = matchedConditions
    .filter(c => c.weight < 0)
    .map(c => ({
      type: "contradicting" as const,
      assertion: c.message,
      weight: Math.abs(c.weight),
      source: c.category,
      timestamp: temporal.firstFailureAt,
    }));
  
  const missingEvidence: string[] = [];
  
  if (dvrFailures.length === 0) {
    missingEvidence.push("DVR health and connectivity telemetry");
  }
  
  if (dvrWithDownstream.length === 0) {
    missingEvidence.push("Camera-to-DVR channel mapping in topology");
  }
  
  const explanation = generateExplanation(blast, dvrFailures.length, confidence);
  
  const recommendedActions = [
    "Verify DVR/recorder hardware status and connectivity",
    "Check DVR system logs for hardware or software failures",
    "Attempt remote DVR restart if accessible via out-of-band management",
    "Verify DVR storage health (disk failures can cause recorder issues)",
    "Check DVR firmware version and update if needed",
    "Coordinate with branch for on-site DVR inspection if remote access unavailable",
  ];
  
  return {
    code: "dvr_failure",
    label: "DVR/Recorder Failure",
    score: normalizedScore,
    confidence,
    certainty,
    supportingEvidence,
    contradictingEvidence,
    missingEvidence,
    affectedEntities: {
      cameras: blast.summary.totalCameras,
      dvrs: blast.summary.totalDVRs,
      branches: blast.summary.totalBranches,
      networks: blast.summary.totalNetworks,
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
  dvrCount: number,
  confidence: number
): string {
  const parts: string[] = [];
  
  parts.push(
    `DVR/recorder failure is the most probable root cause with ${Math.round(confidence * 100)}% confidence.`
  );
  
  parts.push(
    `${dvrCount} DVR/recorder device(s) report unavailability or degraded status, ` +
    `affecting ${blast.summary.totalCameras} connected cameras.`
  );
  
  parts.push(
    "Network infrastructure and edge agents remain healthy, ruling out widespread connectivity issues. " +
    "The problem is isolated to the DVR/recorder layer."
  );
  
  if (blast.summary.totalDVRs === 1) {
    parts.push(
      "Single DVR impact suggests hardware failure, storage issue, or software crash requiring on-site investigation."
    );
  } else {
    parts.push(
      `Multiple DVRs (${blast.summary.totalDVRs}) affected may indicate common firmware issue or configuration problem.`
    );
  }
  
  return parts.join(" ");
}
