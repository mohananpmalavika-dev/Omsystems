/**
 * Evidence Analysis System
 * 
 * Analyzes supporting, contradicting, and missing evidence to build
 * transparent, explainable root cause diagnoses.
 */

import type { 
  RootCauseCandidate, 
  EvidenceItem, 
  OperationalEvent,
  BlastRadius,
  TemporalAnalysis,
} from "./types.js";
import type { OperationalGraph } from "../types.js";

/**
 * Evidence matrix for transparent diagnosis
 */
export interface EvidenceMatrix {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  neutral: EvidenceItem[];
  missing: string[];
  
  supportingWeight: number;
  contradictingWeight: number;
  netWeight: number;
  
  qualityScore: number;
}

/**
 * Build comprehensive evidence matrix
 */
export function buildEvidenceMatrix(
  candidate: RootCauseCandidate,
  events: OperationalEvent[],
  graph: OperationalGraph,
  blast: BlastRadius,
  temporal: TemporalAnalysis
): EvidenceMatrix {
  const supporting = candidate.supportingEvidence;
  const contradicting = candidate.contradictingEvidence;
  
  // Extract neutral evidence (observations that don't support or contradict)
  const neutral = extractNeutralEvidence(events, supporting, contradicting);
  
  // Calculate weights
  const supportingWeight = supporting.reduce((sum, e) => sum + e.weight, 0);
  const contradictingWeight = contradicting.reduce((sum, e) => sum + e.weight, 0);
  const netWeight = supportingWeight - contradictingWeight;
  
  // Calculate quality score (0-100)
  const qualityScore = calculateMatrixQualityScore({
    supporting,
    contradicting,
    neutral,
    missing: candidate.missingEvidence,
  });
  
  return {
    supporting,
    contradicting,
    neutral,
    missing: candidate.missingEvidence,
    supportingWeight,
    contradictingWeight,
    netWeight,
    qualityScore,
  };
}

/**
 * Extract neutral evidence from events
 */
function extractNeutralEvidence(
  events: OperationalEvent[],
  supporting: EvidenceItem[],
  contradicting: EvidenceItem[]
): EvidenceItem[] {
  const neutral: EvidenceItem[] = [];
  
  // Get unique event types that aren't in supporting/contradicting
  const supportingStrings = new Set(supporting.map(e => e.assertion.toLowerCase()));
  const contradictingStrings = new Set(contradicting.map(e => e.assertion.toLowerCase()));
  
  const eventTypes = new Map<string, number>();
  for (const event of events) {
    eventTypes.set(event.eventType, (eventTypes.get(event.eventType) || 0) + 1);
  }
  
  for (const [eventType, count] of eventTypes.entries()) {
    const eventStr = eventType.toLowerCase();
    
    // Skip if already in supporting or contradicting
    if (
      Array.from(supportingStrings).some(s => s.includes(eventStr) || eventStr.includes(s.slice(0, 10))) ||
      Array.from(contradictingStrings).some(s => s.includes(eventStr) || eventStr.includes(s.slice(0, 10)))
    ) {
      continue;
    }
    
    neutral.push({
      type: "neutral",
      assertion: `${count} ${eventType.replace(/_/g, " ")} event(s) observed`,
      weight: 0,
      source: "telemetry",
      timestamp: events[0]?.timestamp || new Date().toISOString(),
    });
  }
  
  return neutral.slice(0, 5); // Limit to 5 neutral items
}

/**
 * Calculate evidence matrix quality score
 */
function calculateMatrixQualityScore(matrix: {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  neutral: EvidenceItem[];
  missing: string[];
}): number {
  let score = 0;
  
  // Supporting evidence adds to quality
  score += Math.min(matrix.supporting.length * 10, 50);
  
  // Strong supporting evidence adds more
  const strongSupporting = matrix.supporting.filter(e => e.weight >= 25);
  score += strongSupporting.length * 5;
  
  // Contradicting evidence reduces quality
  score -= matrix.contradicting.length * 8;
  
  // Missing critical evidence reduces quality
  score -= Math.min(matrix.missing.length * 5, 25);
  
  // Neutral evidence adds slight quality (completeness)
  score += Math.min(matrix.neutral.length * 2, 10);
  
  return Math.min(Math.max(score, 0), 100);
}

/**
 * Generate negative evidence analysis
 * Identifies what we DON'T see that would contradict the hypothesis
 */
export function analyzeNegativeEvidence(
  candidate: RootCauseCandidate,
  events: OperationalEvent[],
  graph: OperationalGraph
): Array<{ assertion: string; significance: "high" | "medium" | "low" }> {
  const negativeEvidence: Array<{ assertion: string; significance: "high" | "medium" | "low" }> = [];
  
  // Negative evidence based on root cause type
  switch (candidate.code) {
    case "wan_failure":
      negativeEvidence.push(...analyzeWANNegativeEvidence(events, graph));
      break;
    
    case "power_failure":
      negativeEvidence.push(...analyzePowerNegativeEvidence(events, graph));
      break;
    
    case "dvr_failure":
      negativeEvidence.push(...analyzeDVRNegativeEvidence(events, graph));
      break;
    
    case "camera_hardware_failure":
      negativeEvidence.push(...analyzeCameraNegativeEvidence(events, graph));
      break;
  }
  
  return negativeEvidence;
}

/**
 * Analyze negative evidence for WAN failure
 */
function analyzeWANNegativeEvidence(
  events: OperationalEvent[],
  graph: OperationalGraph
): Array<{ assertion: string; significance: "high" | "medium" | "low" }> {
  const evidence: Array<{ assertion: string; significance: "high" | "medium" | "low" }> = [];
  
  // No camera hardware alarms
  const cameraHardwareFailures = events.filter(e => 
    e.entity.type === "camera" && 
    e.eventType === "camera_offline" &&
    e.source === "camera" // Direct from camera, not inferred
  );
  
  if (cameraHardwareFailures.length === 0) {
    evidence.push({
      assertion: "No camera-specific hardware failure alarms detected, ruling out widespread camera hardware issues",
      significance: "high",
    });
  }
  
  // DVRs report cameras unavailable vs DVRs themselves offline
  const dvrUnavailable = events.filter(e => e.eventType === "dvr_offline");
  const recordingDegraded = events.filter(e => e.eventType === "recording_stopped");
  
  if (dvrUnavailable.length > 0 && recordingDegraded.length === 0) {
    evidence.push({
      assertion: "DVRs are completely unreachable rather than showing partial recording degradation, consistent with network-level failure",
      significance: "high",
    });
  }
  
  // No power issues
  const powerIssues = events.filter(e => 
    e.eventType === "power_loss" || e.eventType === "power_on_battery"
  );
  
  if (powerIssues.length === 0) {
    evidence.push({
      assertion: "No UPS or power infrastructure alarms, ruling out utility power failure as root cause",
      significance: "medium",
    });
  }
  
  return evidence;
}

/**
 * Analyze negative evidence for power failure
 */
function analyzePowerNegativeEvidence(
  events: OperationalEvent[],
  graph: OperationalGraph
): Array<{ assertion: string; significance: "high" | "medium" | "low" }> {
  const evidence: Array<{ assertion: string; significance: "high" | "medium" | "low" }> = [];
  
  // Network infrastructure still healthy
  const networkHealthy = graph.entities.filter(e => 
    e.entityType === "network" && e.status === "online"
  );
  
  if (networkHealthy.length > 0) {
    evidence.push({
      assertion: "Network infrastructure reports healthy status, suggesting power issue is localized rather than facility-wide",
      significance: "medium",
    });
  }
  
  return evidence;
}

/**
 * Analyze negative evidence for DVR failure
 */
function analyzeDVRNegativeEvidence(
  events: OperationalEvent[],
  graph: OperationalGraph
): Array<{ assertion: string; significance: "high" | "medium" | "low" }> {
  const evidence: Array<{ assertion: string; significance: "high" | "medium" | "low" }> = [];
  
  // Network healthy
  const networkIssues = events.filter(e => 
    e.eventType === "wan_down" || e.eventType === "network_degraded"
  );
  
  if (networkIssues.length === 0) {
    evidence.push({
      assertion: "No network degradation detected, ruling out upstream WAN failure",
      significance: "high",
    });
  }
  
  // Edge agents still reporting
  const edgeOffline = events.filter(e => e.eventType === "edge_agent_offline");
  
  if (edgeOffline.length === 0) {
    evidence.push({
      assertion: "Edge agents remain connected and reporting, confirming network connectivity intact",
      significance: "high",
    });
  }
  
  return evidence;
}

/**
 * Analyze negative evidence for camera hardware failure
 */
function analyzeCameraNegativeEvidence(
  events: OperationalEvent[],
  graph: OperationalGraph
): Array<{ assertion: string; significance: "high" | "medium" | "low" }> {
  const evidence: Array<{ assertion: string; significance: "high" | "medium" | "low" }> = [];
  
  // DVRs healthy
  const dvrIssues = events.filter(e => e.eventType === "dvr_offline");
  
  if (dvrIssues.length === 0) {
    evidence.push({
      assertion: "DVRs report healthy status, confirming camera-level issue rather than recorder failure",
      significance: "high",
    });
  }
  
  return evidence;
}

/**
 * Prioritize missing evidence by importance
 */
export function prioritizeMissingEvidence(
  missing: string[],
  rootCauseCode: string,
  currentConfidence: number
): Array<{ evidence: string; priority: "critical" | "high" | "medium" | "low"; potentialImpact: string }> {
  return missing.map(evidence => {
    let priority: "critical" | "high" | "medium" | "low" = "medium";
    let potentialImpact = "";
    
    // Critical evidence can significantly change diagnosis
    if (currentConfidence < 0.7) {
      if (
        evidence.toLowerCase().includes("telemetry") ||
        evidence.toLowerCase().includes("status") ||
        evidence.toLowerCase().includes("confirmation")
      ) {
        priority = "critical";
        potentialImpact = `Could increase confidence by 15-25% and confirm ${rootCauseCode}`;
      }
    }
    
    // High priority evidence clarifies uncertainty
    if (
      evidence.toLowerCase().includes("topology") ||
      evidence.toLowerCase().includes("dependency") ||
      evidence.toLowerCase().includes("health")
    ) {
      priority = "high";
      potentialImpact = "Would provide clearer picture of failure propagation";
    }
    
    // Low priority is nice-to-have
    if (
      evidence.toLowerCase().includes("baseline") ||
      evidence.toLowerCase().includes("historical")
    ) {
      priority = "low";
      potentialImpact = "Would improve future diagnoses but not critical for current incident";
    }
    
    if (!potentialImpact) {
      potentialImpact = `Would provide additional context for ${rootCauseCode} hypothesis`;
    }
    
    return {
      evidence,
      priority,
      potentialImpact,
    };
  }).sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Generate evidence summary for display
 */
export function generateEvidenceSummary(matrix: EvidenceMatrix): string {
  const parts: string[] = [];
  
  parts.push(`**Evidence Analysis:**`);
  parts.push(
    `• Supporting Evidence: ${matrix.supporting.length} items (${matrix.supportingWeight} points)`
  );
  
  if (matrix.contradicting.length > 0) {
    parts.push(
      `• Contradicting Evidence: ${matrix.contradicting.length} items (-${matrix.contradictingWeight} points)`
    );
  }
  
  if (matrix.missing.length > 0) {
    parts.push(
      `• Missing Evidence: ${matrix.missing.length} items needed for higher confidence`
    );
  }
  
  parts.push(
    `• Net Weight: ${matrix.netWeight} points`
  );
  
  parts.push(
    `• Evidence Quality: ${matrix.qualityScore}/100`
  );
  
  return parts.join("\n");
}

/**
 * Compare evidence across multiple candidates
 */
export function compareEvidenceAcrossCandidates(
  candidates: RootCauseCandidate[]
): {
  commonEvidence: string[];
  uniqueEvidence: Map<string, string[]>;
  conflictingEvidence: Array<{ candidate1: string; candidate2: string; conflict: string }>;
} {
  const allEvidence = new Map<string, Set<string>>();
  
  // Collect all evidence by candidate
  for (const candidate of candidates) {
    const evidence = new Set<string>();
    
    for (const item of candidate.supportingEvidence) {
      evidence.add(item.assertion);
    }
    
    allEvidence.set(candidate.code, evidence);
  }
  
  // Find common evidence (appears in all candidates)
  const commonEvidence: string[] = [];
  if (candidates.length > 1) {
    const firstSet = allEvidence.get(candidates[0]!.code);
    if (firstSet) {
      for (const evidence of firstSet) {
        if (Array.from(allEvidence.values()).every(set => 
          Array.from(set).some(e => 
            e.toLowerCase().includes(evidence.toLowerCase().slice(0, 20))
          )
        )) {
          commonEvidence.push(evidence);
        }
      }
    }
  }
  
  // Find unique evidence per candidate
  const uniqueEvidence = new Map<string, string[]>();
  for (const [code, evidence] of allEvidence.entries()) {
    const unique: string[] = [];
    
    for (const item of evidence) {
      const appearsInOthers = Array.from(allEvidence.entries()).some(([otherCode, otherEvidence]) => 
        otherCode !== code && Array.from(otherEvidence).some(e => 
          e.toLowerCase().includes(item.toLowerCase().slice(0, 20))
        )
      );
      
      if (!appearsInOthers) {
        unique.push(item);
      }
    }
    
    if (unique.length > 0) {
      uniqueEvidence.set(code, unique);
    }
  }
  
  // Find conflicting evidence (contradicts between candidates)
  const conflictingEvidence: Array<{ candidate1: string; candidate2: string; conflict: string }> = [];
  
  // This would require deeper semantic analysis
  // For now, return empty array
  
  return {
    commonEvidence,
    uniqueEvidence,
    conflictingEvidence,
  };
}
