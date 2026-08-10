/**
 * Confidence Scoring System
 * 
 * Provides explainable confidence calculations with evidence weighting,
 * Bayesian-style reasoning, and transparency into how scores are derived.
 */

import type { 
  RootCauseCandidate, 
  EvidenceItem, 
  ConfidenceBreakdown,
  RuleCondition,
} from "./types.js";

/**
 * Calculate confidence score with detailed breakdown
 */
export function calculateConfidenceScore(
  conditions: RuleCondition[],
  options: {
    baselineConfidence?: number;
    historicalPriorProbability?: number;
    negativeEvidencePenalty?: number;
  } = {}
): ConfidenceBreakdown {
  const {
    baselineConfidence = 0,
    historicalPriorProbability,
    negativeEvidencePenalty = 0.2,
  } = options;
  
  // Separate positive and negative conditions
  const positiveConditions = conditions.filter(c => c.condition && c.weight > 0);
  const negativeConditions = conditions.filter(c => c.condition && c.weight < 0);
  
  // Calculate raw positive score
  const positiveScore = positiveConditions.reduce((sum, c) => sum + c.weight, 0);
  
  // Calculate negative score
  const negativeScore = Math.abs(
    negativeConditions.reduce((sum, c) => sum + c.weight, 0)
  );
  
  // Apply negative evidence penalty
  const adjustedNegativeScore = negativeScore * (1 + negativeEvidencePenalty);
  
  // Net score
  let totalScore = positiveScore - adjustedNegativeScore;
  
  // Apply baseline confidence if provided
  if (baselineConfidence > 0) {
    totalScore = Math.max(totalScore, baselineConfidence * 100);
  }
  
  // Apply historical prior if available (Bayesian update)
  if (historicalPriorProbability !== undefined && historicalPriorProbability > 0) {
    const priorWeight = 0.15; // 15% weight to historical data
    const evidenceWeight = 0.85; // 85% weight to current evidence
    
    const priorScore = historicalPriorProbability * 100;
    totalScore = (totalScore * evidenceWeight) + (priorScore * priorWeight);
  }
  
  // Normalize to 0-100 range
  const normalizedScore = Math.min(Math.max(Math.round(totalScore), 0), 100);
  const confidencePercent = normalizedScore;
  
  // Build component breakdown
  const components: ConfidenceBreakdown["components"] = [];
  
  // Group conditions by category
  const byCategory = new Map<string, RuleCondition[]>();
  for (const condition of positiveConditions) {
    const existing = byCategory.get(condition.category) || [];
    existing.push(condition);
    byCategory.set(condition.category, existing);
  }
  
  for (const [category, categoryConditions] of byCategory.entries()) {
    const categoryScore = categoryConditions.reduce((sum, c) => sum + c.weight, 0);
    const maxPoints = categoryScore; // Simplified - could calculate theoretical max
    
    components.push({
      category: formatCategory(category),
      description: categoryConditions.map(c => c.message).join("; "),
      points: categoryScore,
      maxPoints,
    });
  }
  
  // Build adjustments
  const adjustments: ConfidenceBreakdown["adjustments"] = [];
  
  if (negativeConditions.length > 0) {
    adjustments.push({
      reason: "Contradicting evidence detected",
      adjustment: -adjustedNegativeScore,
    });
  }
  
  if (historicalPriorProbability !== undefined && historicalPriorProbability > 0) {
    adjustments.push({
      reason: `Historical pattern matching (${Math.round(historicalPriorProbability * 100)}% prior probability)`,
      adjustment: (historicalPriorProbability * 100 * 0.15) - (totalScore * 0.15),
    });
  }
  
  if (baselineConfidence > 0 && totalScore < baselineConfidence * 100) {
    adjustments.push({
      reason: "Minimum baseline confidence applied",
      adjustment: (baselineConfidence * 100) - totalScore,
    });
  }
  
  return {
    totalScore: normalizedScore,
    maxPossibleScore: 100,
    confidencePercent,
    components,
    adjustments,
  };
}

/**
 * Classify evidence items by strength
 */
export function classifyEvidenceStrength(
  evidence: EvidenceItem
): "strong" | "moderate" | "weak" {
  if (evidence.weight >= 30) return "strong";
  if (evidence.weight >= 15) return "moderate";
  return "weak";
}

/**
 * Calculate evidence quality score
 */
export function calculateEvidenceQuality(
  evidence: EvidenceItem[]
): {
  quality: "high" | "medium" | "low";
  score: number;
  breakdown: {
    strongEvidence: number;
    moderateEvidence: number;
    weakEvidence: number;
    totalWeight: number;
  };
} {
  let strongCount = 0;
  let moderateCount = 0;
  let weakCount = 0;
  let totalWeight = 0;
  
  for (const item of evidence) {
    totalWeight += item.weight;
    
    const strength = classifyEvidenceStrength(item);
    if (strength === "strong") strongCount++;
    else if (strength === "moderate") moderateCount++;
    else weakCount++;
  }
  
  // Calculate quality score
  let qualityScore = 0;
  qualityScore += strongCount * 30;
  qualityScore += moderateCount * 15;
  qualityScore += weakCount * 5;
  
  // Normalize to 0-100
  const maxPossible = evidence.length * 30;
  const normalizedScore = maxPossible > 0 
    ? Math.round((qualityScore / maxPossible) * 100)
    : 0;
  
  // Classify quality
  let quality: "high" | "medium" | "low";
  if (normalizedScore >= 70 || strongCount >= 3) {
    quality = "high";
  } else if (normalizedScore >= 40 || strongCount >= 1) {
    quality = "medium";
  } else {
    quality = "low";
  }
  
  return {
    quality,
    score: normalizedScore,
    breakdown: {
      strongEvidence: strongCount,
      moderateEvidence: moderateCount,
      weakEvidence: weakCount,
      totalWeight,
    },
  };
}

/**
 * Identify missing evidence that would increase confidence
 */
export function identifyMissingEvidence(
  rootCauseCode: string,
  presentEvidence: EvidenceItem[],
  allPossibleEvidence: string[]
): string[] {
  const presentTypes = new Set(presentEvidence.map(e => e.source));
  
  const missingByRootCause: Record<string, string[]> = {
    wan_failure: [
      "BGP routing table status",
      "ISP outage confirmation",
      "Router/gateway health metrics",
      "WAN circuit availability status",
      "Traceroute to upstream gateway",
    ],
    
    power_failure: [
      "UPS battery runtime estimate",
      "Generator status (if applicable)",
      "Utility power grid status",
      "Power restoration ETA",
      "Battery charge level telemetry",
    ],
    
    dvr_failure: [
      "DVR system logs and error codes",
      "DVR hardware health diagnostics",
      "Storage subsystem status",
      "DVR firmware version and update history",
      "Remote management interface reachability",
    ],
    
    camera_hardware_failure: [
      "Camera diagnostic codes",
      "Physical inspection results",
      "Power over Ethernet (PoE) switch status",
      "Camera firmware version",
      "Environmental conditions (temperature, humidity)",
    ],
    
    isp_outage: [
      "ISP service status page confirmation",
      "Multiple customer reports in same region",
      "ISP support ticket reference",
      "Alternate WAN path status (if available)",
    ],
  };
  
  const potentialMissing = missingByRootCause[rootCauseCode] || allPossibleEvidence;
  
  // Filter to only missing evidence
  return potentialMissing.filter(evidence => {
    // Check if we have similar evidence already
    const evidenceLower = evidence.toLowerCase();
    return !presentEvidence.some(e => 
      e.assertion.toLowerCase().includes(evidenceLower) ||
      evidenceLower.includes(e.assertion.toLowerCase().slice(0, 20))
    );
  });
}

/**
 * Compare confidence between multiple candidates
 */
export function rankCandidatesByConfidence(
  candidates: RootCauseCandidate[]
): Array<RootCauseCandidate & { rank: number; confidenceGap: number }> {
  // Sort by confidence
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  
  return sorted.map((candidate, index) => {
    const nextCandidate = sorted[index + 1];
    const confidenceGap = nextCandidate 
      ? candidate.confidence - nextCandidate.confidence
      : candidate.confidence;
    
    return {
      ...candidate,
      rank: index + 1,
      confidenceGap,
    };
  });
}

/**
 * Assess diagnostic certainty based on confidence and evidence quality
 */
export function assessDiagnosticCertainty(
  confidence: number,
  evidenceQuality: ReturnType<typeof calculateEvidenceQuality>,
  contradictingEvidenceCount: number
): {
  certainty: "confirmed" | "likely" | "possible" | "unknown";
  reasoning: string;
} {
  // High confidence + high quality evidence + no contradictions = confirmed
  if (
    confidence >= 0.85 &&
    evidenceQuality.quality === "high" &&
    contradictingEvidenceCount === 0
  ) {
    return {
      certainty: "confirmed",
      reasoning: `High confidence (${Math.round(confidence * 100)}%) with strong supporting evidence and no contradictions`,
    };
  }
  
  // Good confidence + decent evidence = likely
  if (
    confidence >= 0.65 &&
    evidenceQuality.quality !== "low" &&
    contradictingEvidenceCount <= 1
  ) {
    return {
      certainty: "likely",
      reasoning: `Good confidence (${Math.round(confidence * 100)}%) with supporting evidence`,
    };
  }
  
  // Moderate confidence or some contradictions = possible
  if (confidence >= 0.45 || evidenceQuality.quality === "medium") {
    return {
      certainty: "possible",
      reasoning: `Moderate confidence (${Math.round(confidence * 100)}%) or mixed evidence`,
    };
  }
  
  // Low confidence or poor evidence = unknown
  return {
    certainty: "unknown",
    reasoning: `Insufficient evidence or low confidence (${Math.round(confidence * 100)}%)`,
  };
}

/**
 * Generate confidence explanation for operators
 */
export function generateConfidenceExplanation(
  candidate: RootCauseCandidate,
  breakdown: ConfidenceBreakdown
): string {
  const parts: string[] = [];
  
  parts.push(
    `**Confidence: ${breakdown.confidencePercent}%** (${candidate.certainty})`
  );
  
  // Component breakdown
  if (breakdown.components.length > 0) {
    parts.push("\n**Evidence Components:**");
    for (const component of breakdown.components) {
      const percentage = component.maxPoints > 0 
        ? Math.round((component.points / component.maxPoints) * 100)
        : 0;
      parts.push(
        `• ${component.category}: ${component.points} pts (${percentage}%)`
      );
    }
  }
  
  // Adjustments
  if (breakdown.adjustments.length > 0) {
    parts.push("\n**Confidence Adjustments:**");
    for (const adjustment of breakdown.adjustments) {
      const sign = adjustment.adjustment >= 0 ? "+" : "";
      parts.push(
        `• ${adjustment.reason}: ${sign}${Math.round(adjustment.adjustment)} pts`
      );
    }
  }
  
  // Evidence quality
  const evidenceQuality = calculateEvidenceQuality(candidate.supportingEvidence);
  parts.push(
    `\n**Evidence Quality:** ${evidenceQuality.quality.toUpperCase()} ` +
    `(${evidenceQuality.breakdown.strongEvidence} strong, ` +
    `${evidenceQuality.breakdown.moderateEvidence} moderate, ` +
    `${evidenceQuality.breakdown.weakEvidence} weak)`
  );
  
  return parts.join("\n");
}

/**
 * Format category name for display
 */
function formatCategory(category: string): string {
  const mapping: Record<string, string> = {
    telemetry: "Telemetry Data",
    topology: "Network Topology",
    temporal: "Temporal Analysis",
    historical: "Historical Patterns",
  };
  
  return mapping[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Calculate confidence interval (uncertainty range)
 */
export function calculateConfidenceInterval(
  confidence: number,
  evidenceCount: number,
  contradictingEvidenceCount: number
): { lower: number; upper: number; margin: number } {
  // More evidence = narrower interval
  // Contradicting evidence = wider interval
  
  let baseMargin = 0.15; // 15% base uncertainty
  
  // Reduce margin with more evidence
  if (evidenceCount >= 5) {
    baseMargin -= 0.05;
  }
  if (evidenceCount >= 10) {
    baseMargin -= 0.05;
  }
  
  // Increase margin with contradictions
  if (contradictingEvidenceCount > 0) {
    baseMargin += 0.05 * contradictingEvidenceCount;
  }
  
  // Confidence near extremes has smaller margin
  if (confidence >= 0.9 || confidence <= 0.1) {
    baseMargin *= 0.7;
  }
  
  const margin = Math.min(baseMargin, 0.3); // Cap at 30%
  const lower = Math.max(0, confidence - margin);
  const upper = Math.min(1, confidence + margin);
  
  return {
    lower: Math.round(lower * 100) / 100,
    upper: Math.round(upper * 100) / 100,
    margin: Math.round(margin * 100) / 100,
  };
}
