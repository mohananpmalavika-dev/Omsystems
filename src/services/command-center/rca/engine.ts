/**
 * Autonomous Root Cause Analysis Engine
 * 
 * Orchestrates normalized telemetry analysis, topology reasoning, temporal correlation,
 * and evidence-based diagnosis to identify root causes of infrastructure failures.
 */

import { createHash } from "node:crypto";
import type { OperationalGraph, CommandTimelineEvent } from "../types.js";
import type { RCADiagnosis, RootCauseCandidate, HistoricalCase } from "./types.js";
import { normalizeTimelineEvents } from "./normalizer.js";
import { calculateBlastRadius, generateImpactStatement, isWidespreadFailure } from "./blast-radius.js";
import { analyzeTemporalPattern, describeTemporalPattern } from "./temporal-analysis.js";
import { analyzeMultiBranchFailure, generateMultiBranchSummary } from "./multi-branch-analyzer.js";
import { evaluateWANFailure } from "./rules/wan-failure.js";
import { evaluatePowerFailure } from "./rules/power-failure.js";
import { evaluateDVRFailure } from "./rules/dvr-failure.js";
import { 
  buildEvidenceMatrix, 
  analyzeNegativeEvidence,
  prioritizeMissingEvidence,
  generateEvidenceSummary,
} from "./evidence-analyzer.js";
import {
  calculateConfidenceScore,
  assessDiagnosticCertainty,
  calculateEvidenceQuality,
  generateConfidenceExplanation,
  calculateConfidenceInterval,
} from "./confidence-scorer.js";

/**
 * Main RCA Engine - analyzes failures and produces diagnosis
 */
export class RCAEngine {
  private historicalCases: Map<string, HistoricalCase> = new Map();
  
  /**
   * Analyze operational state and produce root cause diagnosis
   */
  async analyze(
    graph: OperationalGraph,
    timeline: CommandTimelineEvent[],
    options: {
      tenantId: string;
      branchId: string;
      includeHistorical?: boolean;
    }
  ): Promise<RCADiagnosis> {
    // Step 1: Normalize telemetry events
    const events = normalizeTimelineEvents(timeline);
    
    // Step 2: Calculate blast radius
    const blastRadius = calculateBlastRadius(events);
    
    // Step 3: Analyze temporal patterns
    const temporalAnalysis = analyzeTemporalPattern(events);
    
    // Step 3.5: Analyze multi-branch patterns if applicable
    const multiBranchAnalysis = analyzeMultiBranchFailure(events, blastRadius, temporalAnalysis);
    
    // Step 4: Evaluate all root cause rules (pass multi-branch context)
    const candidates = this.evaluateRootCauses(events, graph, multiBranchAnalysis);
    
    // Step 5: Sort candidates by confidence
    const sortedCandidates = candidates
      .filter((c): c is RootCauseCandidate => c !== null)
      .sort((a, b) => b.confidence - a.confidence);
    
    // Step 6: Select primary cause and alternatives
    const [primaryCause, ...alternativeCauses] = sortedCandidates.length > 0
      ? sortedCandidates
      : [this.generateInsufficientEvidenceDiagnosis(events, blastRadius)];
    
    // Step 6.5: Enhance primary cause with detailed evidence analysis
    const enhancedPrimaryCause = this.enhanceWithEvidenceAnalysis(
      primaryCause!,
      events,
      graph,
      blastRadius,
      temporalAnalysis
    );
    
    // Step 7: Enhance with historical case matching
    if (options.includeHistorical) {
      await this.enhanceWithHistoricalCases(enhancedPrimaryCause, alternativeCauses);
    }
    
    // Step 8: Generate case fingerprint
    const caseFingerprint = this.generateFingerprint(
      options.branchId,
      enhancedPrimaryCause.code,
      blastRadius
    );
    
    // Step 9: Build complete diagnosis
    const diagnosis: RCADiagnosis = {
      diagnosisId: `rca-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tenantId: options.tenantId,
      branchId: options.branchId,
      
      primaryCause: enhancedPrimaryCause,
      alternativeCauses: alternativeCauses.slice(0, 3), // Top 3 alternatives
      
      blastRadius,
      temporalAnalysis,
      
      confidenceScore: enhancedPrimaryCause.confidence,
      certainty: enhancedPrimaryCause.certainty,
      
      explanation: this.generateExplanation(enhancedPrimaryCause, blastRadius, temporalAnalysis, multiBranchAnalysis),
      businessImpact: this.generateBusinessImpact(blastRadius, temporalAnalysis, multiBranchAnalysis),
      
      recommendedActions: this.prioritizeActions(enhancedPrimaryCause, multiBranchAnalysis),
      
      evidenceMatrix: {
        supporting: enhancedPrimaryCause.supportingEvidence,
        contradicting: enhancedPrimaryCause.contradictingEvidence,
        missing: enhancedPrimaryCause.missingEvidence,
      },
      
      caseFingerprint,
      reasoningVersion: "rca-engine-v2.0",
      generatedAt: new Date().toISOString(),
    };
    
    return diagnosis;
  }
  
  /**
   * Enhance candidate with detailed evidence analysis
   */
  private enhanceWithEvidenceAnalysis(
    candidate: RootCauseCandidate,
    events: any[],
    graph: OperationalGraph,
    blast: any,
    temporal: any
  ): RootCauseCandidate {
    // Build comprehensive evidence matrix
    const evidenceMatrix = buildEvidenceMatrix(candidate, events, graph, blast, temporal);
    
    // Analyze negative evidence (what we DON'T see)
    const negativeEvidence = analyzeNegativeEvidence(candidate, events, graph);
    
    // Add negative evidence to supporting evidence (absence of contradictions is supporting)
    for (const negEv of negativeEvidence) {
      if (negEv.significance === "high") {
        candidate.supportingEvidence.push({
          type: "supporting",
          assertion: negEv.assertion,
          weight: 15,
          source: "negative-evidence-analysis",
          timestamp: events[0]?.timestamp || new Date().toISOString(),
        });
      }
    }
    
    // Prioritize missing evidence
    const prioritizedMissing = prioritizeMissingEvidence(
      candidate.missingEvidence,
      candidate.code,
      candidate.confidence
    );
    
    // Update missing evidence with priorities
    candidate.missingEvidence = prioritizedMissing.map(m => 
      `[${m.priority.toUpperCase()}] ${m.evidence}: ${m.potentialImpact}`
    );
    
    // Calculate evidence quality
    const evidenceQuality = calculateEvidenceQuality(candidate.supportingEvidence);
    
    // Assess diagnostic certainty
    const certaintyAssessment = assessDiagnosticCertainty(
      candidate.confidence,
      evidenceQuality,
      candidate.contradictingEvidence.length
    );
    
    // Update certainty based on comprehensive analysis
    candidate.certainty = certaintyAssessment.certainty;
    
    // Update confidence details
    candidate.confidenceDetails = candidate.confidenceDetails || [];
    
    candidate.confidenceDetails.push(
      `Evidence Quality: ${evidenceQuality.quality.toUpperCase()} (${evidenceQuality.score}/100)`
    );
    candidate.confidenceDetails.push(
      `Diagnostic Certainty: ${certaintyAssessment.certainty.toUpperCase()} - ${certaintyAssessment.reasoning}`
    );
    candidate.confidenceDetails.push(
      `Confidence Interval: ${Math.round(confidenceInterval.lower * 100)}% - ${Math.round(confidenceInterval.upper * 100)}% (±${Math.round(confidenceInterval.margin * 100)}%)`
    );
    
    return candidate;
  }
  
  /**
   * Evaluate all root cause detection rules
   */
  private evaluateRootCauses(
    events: any[],
    graph: OperationalGraph,
    multiBranchAnalysis: any
  ): Array<RootCauseCandidate | null> {
    const candidates: Array<RootCauseCandidate | null> = [];
    
    // Priority order: Power > WAN > DVR > Camera
    // Power failures manifest as many downstream symptoms
    candidates.push(evaluatePowerFailure(events, graph));
    
    // WAN failures affect multiple branches - boost confidence if multi-branch detected
    const wanCandidate = evaluateWANFailure(events, graph);
    if (wanCandidate && multiBranchAnalysis.isMultiBranchFailure) {
      // Increase confidence based on multi-branch correlation
      const correlationBoost = multiBranchAnalysis.correlationStrength * 0.15;
      wanCandidate.confidence = Math.min(0.98, wanCandidate.confidence + correlationBoost);
      wanCandidate.score = Math.round(wanCandidate.confidence * 100);
      
      // Add multi-branch evidence
      if (multiBranchAnalysis.sharedDependencies.some((d: any) => d.dependencyType === "wan")) {
        wanCandidate.supportingEvidence.push({
          type: "supporting",
          assertion: `Multi-branch correlation analysis confirms shared WAN dependency across ${multiBranchAnalysis.affectedBranchCount} branches`,
          weight: 15,
          source: "multi-branch-analysis",
          timestamp: events[0]?.timestamp || new Date().toISOString(),
        });
      }
    }
    candidates.push(wanCandidate);
    
    // DVR failures affect connected cameras
    candidates.push(evaluateDVRFailure(events, graph));
    
    // TODO: Add more rules:
    // - ISP Outage
    // - Camera Hardware Failure
    // - Storage/Disk Failure
    // - Edge Agent Failure
    
    return candidates;
  }
  
  /**
   * Generate diagnosis when evidence is insufficient
   */
  private generateInsufficientEvidenceDiagnosis(
    events: any[],
    blast: any
  ): RootCauseCandidate {
    return {
      code: "insufficient_evidence",
      label: "Root Cause Unknown",
      score: 0,
      confidence: 0,
      certainty: "unknown",
      
      supportingEvidence: events.slice(0, 5).map(e => ({
        type: "supporting" as const,
        assertion: `${e.entity.type} ${e.entity.id} - ${e.eventType}`,
        weight: 5,
        source: "telemetry",
        timestamp: e.timestamp,
      })),
      
      contradictingEvidence: [],
      
      missingEvidence: [
        "Network topology showing upstream dependencies",
        "UPS and power infrastructure telemetry",
        "Historical failure patterns for correlation",
        "Complete device health baseline for comparison",
      ],
      
      affectedEntities: {
        cameras: blast.summary.totalCameras,
        dvrs: blast.summary.totalDVRs,
        branches: blast.summary.totalBranches,
        networks: blast.summary.totalNetworks,
        edgeAgents: blast.affectedEdgeAgents.size,
      },
      
      temporalPattern: {
        firstFailure: events[0]?.timestamp || new Date().toISOString(),
        lastFailure: events[events.length - 1]?.timestamp || new Date().toISOString(),
        timeSpreadSeconds: 0,
        simultaneousFailures: false,
      },
      
      explanation: 
        "Unhealthy conditions detected, but insufficient evidence to determine authoritative root cause. " +
        "Additional telemetry sources or topology information needed for definitive diagnosis.",
      
      recommendedActions: [
        "Enable comprehensive telemetry collection for all infrastructure layers",
        "Verify network topology and dependency mapping",
        "Check UPS and power infrastructure health",
        "Review device-level health metrics and logs",
        "Manual investigation required to identify root cause",
      ],
      
      confidenceDetails: [
        "Insufficient evidence for confident diagnosis",
        "Additional telemetry sources required",
      ],
    };
  }
  
  /**
   * Generate case fingerprint for similarity matching
   */
  private generateFingerprint(
    branchId: string,
    rootCauseCode: string,
    blast: any
  ): string {
    const components = [
      branchId,
      rootCauseCode,
      blast.summary.totalBranches.toString(),
      blast.summary.totalCameras.toString(),
      blast.summary.totalDVRs.toString(),
    ];
    
    return createHash("sha256")
      .update(components.join("|"))
      .digest("hex")
      .slice(0, 24);
  }
  
  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    primaryCause: RootCauseCandidate,
    blast: any,
    temporal: any,
    multiBranchAnalysis?: any
  ): string {
    const parts: string[] = [];
    
    // Primary cause summary
    parts.push(
      `**${primaryCause.label}** is the most probable root cause with ` +
      `**${Math.round(primaryCause.confidence * 100)}% confidence**.`
    );
    
    // Multi-branch context if applicable
    if (multiBranchAnalysis?.isMultiBranchFailure) {
      const multiBranchSummary = generateMultiBranchSummary(multiBranchAnalysis);
      parts.push("\n" + multiBranchSummary);
    }
    
    // Blast radius
    const impactStatement = generateImpactStatement(blast);
    if (impactStatement) {
      parts.push(`\n**Impact:** ${impactStatement}.`);
    }
    
    // Temporal pattern
    const temporalDesc = describeTemporalPattern(temporal);
    parts.push(temporalDesc + ".");
    
    // Key supporting evidence (top 3)
    const topEvidence = primaryCause.supportingEvidence
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    
    if (topEvidence.length > 0) {
      parts.push("\n**Key Evidence:**");
      for (const evidence of topEvidence) {
        parts.push(`• ${evidence.assertion}`);
      }
    }
    
    // Contradicting evidence (if any)
    if (primaryCause.contradictingEvidence.length > 0) {
      parts.push("\n**Contradicting Indicators:**");
      for (const evidence of primaryCause.contradictingEvidence.slice(0, 2)) {
        parts.push(`• ${evidence.assertion}`);
      }
    }
    
    return parts.join("\n");
  }
  
  /**
   * Generate business impact statement
   */
  private generateBusinessImpact(
    blast: any,
    temporal: any,
    multiBranchAnalysis?: any
  ): string {
    const parts: string[] = [];
    
    if (isWidespreadFailure(blast)) {
      parts.push("**CRITICAL BUSINESS IMPACT:**");
      
      if (blast.summary.totalBranches >= 3) {
        parts.push(
          `${blast.summary.totalBranches} branches partially or fully offline, ` +
          "affecting surveillance coverage across multiple locations."
        );
      }
      
      if (blast.summary.totalCameras >= 20) {
        parts.push(
          `${blast.summary.totalCameras} cameras offline represents significant surveillance gap ` +
          "with potential security and compliance implications."
        );
      }
      
      parts.push("Recording verification unavailable for affected cameras.");
      parts.push("Incident detection and response capabilities degraded.");
      
      if (temporal.pattern === "sudden") {
        parts.push("Sudden failure pattern indicates immediate operational impact.");
      }
      
      // Multi-branch impact
      if (multiBranchAnalysis?.isMultiBranchFailure) {
        if (multiBranchAnalysis.diagnosis === "common_cause") {
          parts.push(
            "**Single point of failure detected** - resolving root cause will restore all affected branches."
          );
        } else if (multiBranchAnalysis.diagnosis === "independent") {
          parts.push(
            "**Multiple independent failures** - each branch requires separate investigation and remediation."
          );
        }
      }
    } else {
      parts.push("**Moderate business impact:**");
      parts.push(`${blast.summary.totalCameras} cameras affected in limited area.`);
      parts.push("Surveillance coverage degraded but majority of system operational.");
    }
    
    // Time-based impact
    const durationMinutes = Math.round(temporal.timeSpreadSeconds / 60);
    if (durationMinutes > 30) {
      parts.push(`Failure has persisted for ${durationMinutes} minutes.`);
    }
    
    return parts.join(" ");
  }
  
  /**
   * Prioritize recommended actions by urgency
   */
  private prioritizeActions(
    cause: RootCauseCandidate,
    multiBranchAnalysis?: any
  ): RCADiagnosis["recommendedActions"] {
    const actions = cause.recommendedActions.map((action, index) => {
      // First 2 actions are usually most critical
      const priority = index === 0 ? "immediate" as const
        : index <= 2 ? "high" as const
        : index <= 4 ? "medium" as const
        : "low" as const;
      
      // Assess risk based on action type
      const risk = action.toLowerCase().includes("reboot") || 
                   action.toLowerCase().includes("restart") ? "medium" as const
        : action.toLowerCase().includes("shutdown") ? "high" as const
        : "low" as const;
      
      return {
        action,
        priority,
        risk,
        reason: `Based on ${cause.label} diagnosis`,
      };
    });
    
    // Add multi-branch specific actions if applicable
    if (multiBranchAnalysis?.isMultiBranchFailure && multiBranchAnalysis.diagnosis === "common_cause") {
      actions.unshift({
        action: `Investigate shared ${multiBranchAnalysis.sharedDependencies[0]?.dependencyType || "infrastructure"} ` +
                `affecting ${multiBranchAnalysis.affectedBranchCount} branches`,
        priority: "immediate",
        risk: "low",
        reason: "Multi-branch correlation indicates single root cause - fixing this will restore all affected branches",
      });
    }
    
    return actions;
  }
  
  /**
   * Enhance diagnosis with historical case matching
   */
  private async enhanceWithHistoricalCases(
    primaryCause: RootCauseCandidate,
    alternatives: RootCauseCandidate[]
  ): Promise<void> {
    // TODO: Implement historical case matching
    // This would query past incidents with similar:
    // - Root cause code
    // - Blast radius pattern
    // - Temporal pattern
    // - Branch/infrastructure characteristics
    
    // For now, this is a placeholder for future enhancement
  }
  
  /**
   * Record case outcome for learning
   */
  async recordCaseOutcome(
    diagnosisId: string,
    actualRootCause: string,
    resolutionAction: string,
    successful: boolean,
    timeToResolveMinutes: number
  ): Promise<void> {
    // TODO: Store in historical database for future similarity matching
    // This enables the system to learn from past incidents
  }
}
