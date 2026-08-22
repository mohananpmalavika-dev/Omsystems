/**
 * Multi-Branch Failure Analysis
 * 
 * Specialized analysis for failures affecting multiple branches simultaneously.
 * Identifies shared infrastructure, common causes, and regional patterns.
 */

import type { OperationalEvent, BlastRadius, TemporalAnalysis } from "./types.js";
import type { OperationalGraph } from "../types.js";
import { 
  analyzeBranchCorrelation, 
  identifySharedDependencies,
  calculatePropagationProbability,
  type BranchCorrelation,
  type SharedDependency,
} from "./blast-radius.js";
import { analyzeTemporalPattern } from "./temporal-analysis.js";

export interface MultiBranchAnalysis {
  isMultiBranchFailure: boolean;
  affectedBranchCount: number;
  affectedBranches: string[];
  
  branchClusters: BranchCluster[];
  sharedDependencies: SharedDependency[];
  
  correlationStrength: number; // 0-1, how strongly branches are correlated
  propagationProbability: number; // 0-1, likelihood of cascading failure
  
  regionalPattern?: {
    region?: string;
    geographic: boolean;
    affectedPercentage: number;
  };
  
  commonCauseEvidence: string[];
  independentFailureEvidence: string[];
  
  diagnosis: "common_cause" | "cascading" | "independent" | "unclear";
}

export interface BranchCluster {
  clusterid: string;
  branches: string[];
  failureStartTime: string;
  failureEndTime: string;
  
  commonEntityTypes: string[];
  commonEventTypes: string[];
  
  evidence: string[];
}

/**
 * Analyze multi-branch failure patterns
 */
export function analyzeMultiBranchFailure(
  events: OperationalEvent[],
  blast: BlastRadius,
  temporal: TemporalAnalysis
): MultiBranchAnalysis {
  const affectedBranches = Array.from(blast.affectedBranches);
  const isMultiBranch = affectedBranches.length >= 2;
  
  if (!isMultiBranch) {
    return {
      isMultiBranchFailure: false,
      affectedBranchCount: affectedBranches.length,
      affectedBranches,
      branchClusters: [],
      sharedDependencies: [],
      correlationStrength: 0,
      propagationProbability: 0,
      commonCauseEvidence: [],
      independentFailureEvidence: [],
      diagnosis: "unclear",
    };
  }
  
  // Build branch clusters
  const branchClusters = buildBranchClusters(events, affectedBranches);
  
  // Analyze branch correlation
  const correlations = analyzeBranchCorrelation(events, affectedBranches);
  const avgCorrelation = correlations.length > 0
    ? correlations.reduce((sum, c) => sum + c.correlationStrength, 0) / correlations.length
    : 0;
  
  // Identify shared dependencies
  const sharedDependencies = identifySharedDependencies(events, affectedBranches);
  
  // Calculate propagation probability
  const propagationProb = calculatePropagationProbability(events, blast);
  
  // Gather evidence for common cause
  const commonCauseEvidence = buildCommonCauseEvidence(
    branchClusters,
    correlations,
    sharedDependencies,
    temporal
  );
  
  // Gather evidence for independent failures
  const independentFailureEvidence = buildIndependentFailureEvidence(
    branchClusters,
    temporal,
    avgCorrelation
  );
  
  // Determine diagnosis
  const diagnosis = determineDiagnosis(
    avgCorrelation,
    propagationProb,
    temporal,
    sharedDependencies.length
  );
  
  return {
    isMultiBranchFailure: true,
    affectedBranchCount: affectedBranches.length,
    affectedBranches,
    branchClusters,
    sharedDependencies,
    correlationStrength: avgCorrelation,
    propagationProbability: propagationProb,
    commonCauseEvidence,
    independentFailureEvidence,
    diagnosis,
  };
}

/**
 * Build temporal clusters of branch failures
 */
function buildBranchClusters(
  events: OperationalEvent[],
  branchIds: string[]
): BranchCluster[] {
  const clusters: BranchCluster[] = [];
  const windowSeconds = 120; // 2-minute clustering window
  
  // Group events by branch
  const eventsByBranch = new Map<string, OperationalEvent[]>();
  for (const event of events) {
    if (!event.branchId) continue;
    const existing = eventsByBranch.get(event.branchId) || [];
    existing.push(event);
    eventsByBranch.set(event.branchId, existing);
  }
  
  // Find first failure time per branch
  const branchFailureTimes = new Map<string, string>();
  for (const [branchId, branchEvents] of eventsByBranch.entries()) {
    const sorted = [...branchEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted.length > 0) {
      branchFailureTimes.set(branchId, sorted[0]!.timestamp);
    }
  }
  
  // Sort branches by failure time
  const sortedBranches = Array.from(branchFailureTimes.entries())
    .sort(([, timeA], [, timeB]) => timeA.localeCompare(timeB));
  
  // Build clusters
  let currentCluster: { branches: string[]; startTime: string; endTime: string } | null = null;
  
  for (const [branchId, failureTime] of sortedBranches) {
    if (!currentCluster) {
      currentCluster = {
        branches: [branchId],
        startTime: failureTime,
        endTime: failureTime,
      };
    } else {
      const clusterStartTime = Date.parse(currentCluster.startTime);
      const branchFailureTime = Date.parse(failureTime);
      const gap = (branchFailureTime - clusterStartTime) / 1000;
      
      if (gap <= windowSeconds) {
        currentCluster.branches.push(branchId);
        currentCluster.endTime = failureTime;
      } else {
        // Save current cluster and start new one
        if (currentCluster.branches.length >= 2) {
          clusters.push(buildClusterDetails(currentCluster, eventsByBranch));
        }
        
        currentCluster = {
          branches: [branchId],
          startTime: failureTime,
          endTime: failureTime,
        };
      }
    }
  }
  
  // Add final cluster
  if (currentCluster && currentCluster.branches.length >= 2) {
    clusters.push(buildClusterDetails(currentCluster, eventsByBranch));
  }
  
  return clusters;
}

/**
 * Build detailed cluster information
 */
function buildClusterDetails(
  cluster: { branches: string[]; startTime: string; endTime: string },
  eventsByBranch: Map<string, OperationalEvent[]>
): BranchCluster {
  // Collect all events in cluster
  const clusterEvents: OperationalEvent[] = [];
  for (const branchId of cluster.branches) {
    const branchEvents = eventsByBranch.get(branchId) || [];
    clusterEvents.push(...branchEvents);
  }
  
  // Find common entity types
  const entityTypeSets = cluster.branches.map(branchId => {
    const branchEvents = eventsByBranch.get(branchId) || [];
    return new Set(branchEvents.map(e => e.entity.type));
  });
  
  const commonEntityTypes = Array.from(entityTypeSets[0] || []).filter(type =>
    entityTypeSets.every(set => set.has(type))
  );
  
  // Find common event types
  const eventTypeSets = cluster.branches.map(branchId => {
    const branchEvents = eventsByBranch.get(branchId) || [];
    return new Set(branchEvents.map(e => e.eventType));
  });
  
  const commonEventTypes = Array.from(eventTypeSets[0] || []).filter(type =>
    eventTypeSets.every(set => set.has(type))
  );
  
  // Build evidence
  const evidence: string[] = [];
  
  const timeSpan = (Date.parse(cluster.endTime) - Date.parse(cluster.startTime)) / 1000;
  evidence.push(
    `${cluster.branches.length} branches failed within ${Math.round(timeSpan)} seconds`
  );
  
  if (commonEntityTypes.length > 0) {
    evidence.push(`Common affected infrastructure: ${commonEntityTypes.join(", ")}`);
  }
  
  if (commonEventTypes.length > 0) {
    evidence.push(`Common failure types: ${commonEventTypes.join(", ")}`);
  }
  
  return {
    clusterid: `cluster-${cluster.startTime}`,
    branches: cluster.branches,
    failureStartTime: cluster.startTime,
    failureEndTime: cluster.endTime,
    commonEntityTypes,
    commonEventTypes,
    evidence,
  };
}

/**
 * Build evidence for common cause failure
 */
function buildCommonCauseEvidence(
  clusters: BranchCluster[],
  correlations: BranchCorrelation[],
  dependencies: SharedDependency[],
  temporal: TemporalAnalysis
): string[] {
  const evidence: string[] = [];
  
  // Cluster evidence
  for (const cluster of clusters) {
    if (cluster.branches.length >= 3) {
      evidence.push(
        `Branch Cluster ${cluster.branches.length}: ${cluster.branches.join(", ")} ` +
        `failed simultaneously within ${Math.round((Date.parse(cluster.failureEndTime) - Date.parse(cluster.failureStartTime)) / 1000)}s`
      );
    }
  }
  
  // Correlation evidence
  if (correlations.length > 0 && correlations[0]!.correlationStrength >= 0.8) {
    evidence.push(
      `High correlation (${Math.round(correlations[0]!.correlationStrength * 100)}%) ` +
      `between branch failures indicates common cause`
    );
  }
  
  // Shared dependency evidence
  for (const dependency of dependencies) {
    if (dependency.confidence >= 0.7) {
      evidence.push(
        `Shared ${dependency.dependencyType.toUpperCase()} dependency detected ` +
        `across ${dependency.affectedBranches.length} branches (${Math.round(dependency.confidence * 100)}% confidence)`
      );
    }
  }
  
  // Temporal evidence
  if (temporal.simultaneousFailures) {
    evidence.push(
      "Simultaneous failure pattern strongly suggests single upstream cause"
    );
  }
  
  if (temporal.pattern === "sudden") {
    evidence.push(
      "Sudden failure onset across multiple branches rules out gradual degradation"
    );
  }
  
  return evidence;
}

/**
 * Build evidence for independent failures
 */
function buildIndependentFailureEvidence(
  clusters: BranchCluster[],
  temporal: TemporalAnalysis,
  correlationStrength: number
): string[] {
  const evidence: string[] = [];
  
  // Weak correlation
  if (correlationStrength < 0.4) {
    evidence.push(
      `Low correlation (${Math.round(correlationStrength * 100)}%) ` +
      `between branch failures suggests independent causes`
    );
  }
  
  // No clear clusters
  if (clusters.length === 0) {
    evidence.push(
      "No temporal clustering of failures detected"
    );
  }
  
  // Sporadic pattern
  if (temporal.pattern === "sporadic") {
    evidence.push(
      "Sporadic failure pattern indicates independent device issues"
    );
  }
  
  // Long time spread
  if (temporal.timeSpreadSeconds > 600) {
    evidence.push(
      `Failures spread over ${Math.round(temporal.timeSpreadSeconds / 60)} minutes ` +
      `suggests independent rather than common cause`
    );
  }
  
  return evidence;
}

/**
 * Determine overall diagnosis
 */
function determineDiagnosis(
  correlationStrength: number,
  propagationProbability: number,
  temporal: TemporalAnalysis,
  sharedDependencyCount: number
): MultiBranchAnalysis["diagnosis"] {
  // Strong evidence for common cause
  if (
    correlationStrength >= 0.75 &&
    sharedDependencyCount > 0 &&
    temporal.simultaneousFailures
  ) {
    return "common_cause";
  }
  
  // Evidence for cascading failure
  if (
    propagationProbability >= 0.6 &&
    temporal.pattern === "cascading"
  ) {
    return "cascading";
  }
  
  // Evidence for independent failures
  if (
    correlationStrength < 0.4 &&
    temporal.pattern === "sporadic"
  ) {
    return "independent";
  }
  
  // Unclear - mixed signals
  return "unclear";
}

/**
 * Generate multi-branch summary
 */
export function generateMultiBranchSummary(analysis: MultiBranchAnalysis): string {
  if (!analysis.isMultiBranchFailure) {
    return "Single branch failure - no multi-branch correlation";
  }
  
  const parts: string[] = [];
  
  parts.push(
    `**Multi-Branch Failure Detected:** ${analysis.affectedBranchCount} branches affected`
  );
  
  // Diagnosis
  switch (analysis.diagnosis) {
    case "common_cause":
      parts.push(
        `**Common Cause Failure** (${Math.round(analysis.correlationStrength * 100)}% correlation): ` +
        `All branches likely affected by single upstream infrastructure failure`
      );
      break;
    
    case "cascading":
      parts.push(
        `**Cascading Failure** (${Math.round(analysis.propagationProbability * 100)}% propagation probability): ` +
        `Failure propagating through dependent infrastructure`
      );
      break;
    
    case "independent":
      parts.push(
        "**Independent Failures:** Multiple unrelated incidents occurring simultaneously"
      );
      break;
    
    case "unclear":
      parts.push(
        "**Unclear Pattern:** Mixed evidence for common cause vs independent failures"
      );
      break;
  }
  
  // Clusters
  if (analysis.branchClusters.length > 0) {
    parts.push(
      `${analysis.branchClusters.length} branch cluster(s) identified with temporal correlation`
    );
  }
  
  // Dependencies
  if (analysis.sharedDependencies.length > 0) {
    const deps = analysis.sharedDependencies.map(d => d.dependencyType.toUpperCase());
    parts.push(`Shared dependencies detected: ${deps.join(", ")}`);
  }
  
  return parts.join(". ") + ".";
}
