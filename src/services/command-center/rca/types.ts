/**
 * Autonomous Root Cause Analysis - Type Definitions
 * 
 * Provides structured types for normalized telemetry events, correlation rules,
 * evidence scoring, and diagnostic outputs.
 */

import type { CommandTimelineEvent, EvidenceCertainty } from "../types.js";

/**
 * Normalized operational event - common format for all telemetry sources
 */
export interface OperationalEvent {
  id: string;
  tenantId: string;
  timestamp: string;
  
  entity: {
    type: "camera" | "dvr" | "branch" | "router" | "switch" | "edge_agent" | 
          "network" | "storage" | "ups" | "recorder" | "disk";
    id: string;
    name?: string;
  };
  
  branchId?: string;
  
  eventType:
    | "camera_offline"
    | "dvr_offline"
    | "network_degraded"
    | "wan_down"
    | "packet_loss"
    | "latency_high"
    | "recording_stopped"
    | "disk_failure"
    | "edge_agent_offline"
    | "power_loss"
    | "power_on_battery"
    | "ups_failure"
    | "recorder_unavailable"
    | "recorder_degraded";
  
  severity: "P1" | "P2" | "P3" | "P4";
  
  metrics?: {
    latencyMs?: number;
    packetLoss?: number;
    jitterMs?: number;
    uptime?: number;
    batteryPercent?: number;
    diskUsagePercent?: number;
  };
  
  source: "camera" | "dvr" | "edge" | "network" | "ai" | "system" | "telemetry";
  confidence: number;
}

/**
 * Root cause candidate with scored evidence
 */
export interface RootCauseCandidate {
  code: string;
  label: string;
  score: number;
  confidence: number;
  certainty: EvidenceCertainty;
  
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  missingEvidence: string[];
  
  affectedEntities: {
    cameras: number;
    dvrs: number;
    branches: number;
    networks: number;
    edgeAgents: number;
  };
  
  temporalPattern: {
    firstFailure: string;
    lastFailure: string;
    timeSpreadSeconds: number;
    simultaneousFailures: boolean;
  };
  
  explanation: string;
  recommendedActions: string[];
}

/**
 * Evidence item with weight and type
 */
export interface EvidenceItem {
  type: "supporting" | "contradicting" | "neutral";
  assertion: string;
  weight: number;
  source: string;
  entityId?: string;
  timestamp: string;
  metrics?: Record<string, unknown>;
}

/**
 * Correlation rule for root cause detection
 */
export interface CorrelationRule {
  rootCauseCode: string;
  label: string;
  
  conditions: RuleCondition[];
  
  evidenceWeights: {
    [key: string]: number;
  };
  
  minimumConfidence: number;
  priority: number;
}

/**
 * Rule condition for root cause matching
 */
export interface RuleCondition {
  condition: boolean;
  weight: number;
  message: string;
  category: "topology" | "temporal" | "telemetry" | "historical";
}

/**
 * Blast radius calculation result
 */
export interface BlastRadius {
  affectedBranches: Set<string>;
  affectedCameras: Set<string>;
  affectedDVRs: Set<string>;
  affectedNetworks: Set<string>;
  affectedEdgeAgents: Set<string>;
  
  branchClusterIds: string[];
  
  summary: {
    totalBranches: number;
    totalCameras: number;
    totalDVRs: number;
    totalNetworks: number;
    percentCamerasAffected: number;
  };
}

/**
 * Temporal analysis result
 */
export interface TemporalAnalysis {
  firstFailureAt: string;
  lastFailureAt: string;
  timeSpreadSeconds: number;
  
  failureRate: number; // failures per minute
  simultaneousFailures: boolean;
  
  pattern: "sudden" | "cascading" | "gradual" | "sporadic";
  
  timeline: Array<{
    timestamp: string;
    eventType: string;
    entityId: string;
    entityType: string;
  }>;
}

/**
 * Dependency failure propagation model
 */
export interface FailurePropagation {
  rootEntityId: string;
  rootEntityType: string;
  
  propagationPath: Array<{
    entityId: string;
    entityType: string;
    relationship: string;
    impactType: "direct" | "indirect";
  }>;
  
  expectedDownstreamFailures: string[];
  observedDownstreamFailures: string[];
  
  matchScore: number; // 0-1, how well observed matches expected
}

/**
 * Complete RCA diagnosis
 */
export interface RCADiagnosis {
  diagnosisId: string;
  tenantId: string;
  branchId: string;
  
  primaryCause: RootCauseCandidate;
  alternativeCauses: RootCauseCandidate[];
  
  blastRadius: BlastRadius;
  temporalAnalysis: TemporalAnalysis;
  
  confidenceScore: number;
  certainty: EvidenceCertainty;
  
  explanation: string;
  businessImpact: string;
  
  recommendedActions: Array<{
    action: string;
    priority: "immediate" | "high" | "medium" | "low";
    risk: "low" | "medium" | "high";
    reason: string;
  }>;
  
  evidenceMatrix: {
    supporting: EvidenceItem[];
    contradicting: EvidenceItem[];
    missing: string[];
  };
  
  caseFingerprint: string;
  reasoningVersion: string;
  generatedAt: string;
}

/**
 * Historical case for similarity matching
 */
export interface HistoricalCase {
  caseId: string;
  fingerprint: string;
  
  rootCause: string;
  confidence: number;
  
  affectedEntities: {
    branches: number;
    cameras: number;
    dvrs: number;
  };
  
  resolution: {
    action: string;
    successful: boolean;
    timeToResolveMinutes: number;
  };
  
  occurredAt: string;
  resolvedAt?: string;
}

/**
 * Confidence breakdown for explainability
 */
export interface ConfidenceBreakdown {
  totalScore: number;
  maxPossibleScore: number;
  confidencePercent: number;
  
  components: Array<{
    category: string;
    description: string;
    points: number;
    maxPoints: number;
  }>;
  
  adjustments: Array<{
    reason: string;
    adjustment: number;
  }>;
}
