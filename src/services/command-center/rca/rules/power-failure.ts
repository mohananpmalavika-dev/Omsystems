/**
 * Power Failure Detection Rule
 * 
 * Detects utility power loss and UPS failures affecting infrastructure.
 * Power failures often manifest as multiple device offline events.
 */

import type { OperationalGraph } from "../../types.js";
import type { OperationalEvent, RootCauseCandidate, RuleCondition } from "../types.js";
import { calculateBlastRadius } from "../blast-radius.js";
import { analyzeTemporalPattern } from "../temporal-analysis.js";

export function evaluatePowerFailure(
  events: OperationalEvent[],
  graph: OperationalGraph
): RootCauseCandidate | null {
  const conditions: RuleCondition[] = [];
  
  // Get failure types
  const powerLossEvents = events.filter(e => e.eventType === "power_loss");
  const onBatteryEvents = events.filter(e => e.eventType === "power_on_battery");
  const upsFailures = events.filter(e => e.entity.type === "ups");
  const cameraFailures = events.filter(e => e.eventType === "camera_offline");
  const dvrFailures = events.filter(e => e.eventType === "dvr_offline");
  const networkFailures = events.filter(e => 
    e.eventType === "wan_down" || e.eventType === "network_degraded"
  );
  
  // Calculate blast radius
  const blast = calculateBlastRadius(events);
  const temporal = analyzeTemporalPattern(events);
  
  // Rule conditions
  
  // Direct UPS telemetry
  conditions.push({
    condition: powerLossEvents.length > 0,
    weight: 50,
    message: `UPS telemetry reports utility power unavailable (${powerLossEvents.length} events)`,
    category: "telemetry",
  });
  
  conditions.push({
    condition: onBatteryEvents.length > 0,
    weight: 30,
    message: `UPS reports battery operation (${onBatteryEvents.length} UPS devices)`,
    category: "telemetry",
  });
  
  // Multiple devices affected without network failure
  conditions.push({
    condition: (cameraFailures.length > 0 || dvrFailures.length > 0) && networkFailures.length === 0,
    weight: 20,
    message: `${cameraFailures.length + dvrFailures.length} devices offline without primary network failure indication`,
    category: "topology",
  });
  
  // DVRs and cameras affected together
  conditions.push({
    condition: dvrFailures.length > 0 && cameraFailures.length > 0,
    weight: 15,
    message: "Both recorders and cameras affected, consistent with power infrastructure failure",
    category: "topology",
  });
  
  // Network devices also affected (total infrastructure loss)
  conditions.push({
    condition: networkFailures.length > 0 && powerLossEvents.length > 0,
    weight: 20,
    message: "Network infrastructure affected coincident with UPS power loss",
    category: "telemetry",
  });
  
  // UPS in topology showing failure
  const upsInTopology = graph.entities.filter(e => 
    e.entityType === "ups" && ["offline", "critical"].includes(e.status)
  );
  
  conditions.push({
    condition: upsInTopology.length > 0,
    weight: 25,
    message: `${upsInTopology.length} UPS devices in critical state with downstream devices affected`,
    category: "topology",
  });
  
  // Temporal - sudden failure
  conditions.push({
    condition: temporal.simultaneousFailures,
    weight: 15,
    message: "Simultaneous device failures consistent with instant power loss",
    category: "temporal",
  });
  
  // Calculate score
  const matchedConditions = conditions.filter(c => c.condition);
  const totalScore = matchedConditions.reduce((sum, c) => sum + c.weight, 0);
  const normalizedScore = Math.min(Math.max(totalScore, 0), 100);
  const confidence = normalizedScore / 100;
  
  // Require minimum threshold
  if (normalizedScore < 40) {
    return null;
  }
  
  const certainty = confidence >= 0.85 ? "confirmed" as const
    : confidence >= 0.65 ? "likely" as const
    : confidence >= 0.45 ? "possible" as const
    : "unknown" as const;
  
  // Build evidence
  const supportingEvidence = matchedConditions.map(c => ({
    type: "supporting" as const,
    assertion: c.message,
    weight: c.weight,
    source: c.category,
    timestamp: temporal.firstFailureAt,
  }));
  
  const contradictingEvidence: any[] = [];
  
  // Missing evidence
  const missingEvidence: string[] = [];
  
  if (powerLossEvents.length === 0 && onBatteryEvents.length === 0) {
    missingEvidence.push("Direct UPS telemetry showing utility power loss");
  }
  
  if (upsInTopology.length === 0) {
    missingEvidence.push("UPS infrastructure health status in topology");
  }
  
  // Explanation
  const explanation = generateExplanation(
    powerLossEvents.length,
    onBatteryEvents.length,
    blast,
    temporal,
    confidence
  );
  
  // Recommended actions
  const recommendedActions = [
    "Verify utility power status at affected branch",
    "Check UPS battery status and runtime capacity",
    "Check generator status if site has backup power",
    "Coordinate with facilities team for power restoration",
    "Prepare for graceful shutdown if battery runtime is low",
    "Monitor power restoration and device auto-recovery",
  ];
  
  return {
    code: "power_failure",
    label: "Utility Power Failure",
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
  powerLossCount: number,
  batteryCount: number,
  blast: any,
  temporal: any,
  confidence: number
): string {
  const parts: string[] = [];
  
  parts.push(
    `Utility power failure is the most probable root cause with ${Math.round(confidence * 100)}% confidence.`
  );
  
  if (powerLossCount > 0) {
    parts.push(
      `UPS telemetry explicitly reports utility power unavailable at ${powerLossCount} location(s).`
    );
  }
  
  if (batteryCount > 0) {
    parts.push(
      `${batteryCount} UPS device(s) switched to battery operation, indicating mains power loss.`
    );
  }
  
  if (blast.summary.totalCameras > 0 || blast.summary.totalDVRs > 0) {
    parts.push(
      `${blast.summary.totalCameras} cameras and ${blast.summary.totalDVRs} DVRs are affected. ` +
      "This widespread impact across different device types is consistent with upstream power infrastructure failure."
    );
  }
  
  if (temporal.simultaneousFailures) {
    parts.push(
      "The simultaneous failure pattern indicates an instant power loss event rather than gradual device degradation."
    );
  }
  
  parts.push(
    "Immediate action is required to restore utility power or ensure adequate battery runtime for critical surveillance."
  );
  
  return parts.join(" ");
}
