/**
 * CEO Screen — Domain Types
 *
 * The Executive Command Center answers exactly five core questions:
 * 1. What is broken? (Real-time active outages & degraded branches)
 * 2. What will break? (Predictive 24/48/72-hour horizon risk assessment)
 * 3. Why? (Root cause attribution: HDD / Network / DVR / Camera / Power)
 * 4. What is the business impact? (Cameras, branches, vaults, regulatory compliance risks)
 * 5. What should I do? (Prescriptive, one-click remediation actions)
 */

// ─── 1. WHAT IS BROKEN? ───────────────────────────────────────────────────────

export type BranchDegradationSeverity = "CRITICAL" | "DEGRADED" | "WARNING" | "HEALTHY";

export interface DegradedBranchSummary {
  branchId: string;
  branchName: string;
  region: string;
  severity: BranchDegradationSeverity;
  offlineCamerasCount: number;
  totalCamerasCount: number;
  isRecordingInterrupted: boolean;
  activeIssues: string[];
  lastHeartbeat: Date;
}

export interface WhatIsBrokenAnswer {
  summaryHeadline: string; // e.g. "27 branches degraded"
  totalBranchesMonitored: number;
  degradedBranchesCount: number;
  criticalBranchesCount: number;
  healthyBranchesCount: number;
  fleetHealthPct: number; // 0 - 100
  degradedBranches: DegradedBranchSummary[];
  activeOutagesCount: number;
}

// ─── 2. WHAT WILL BREAK? ─────────────────────────────────────────────────────

export type RiskHorizon = "24_HOURS" | "48_HOURS" | "72_HOURS";

export interface AtRiskBranchPrediction {
  branchId: string;
  branchName: string;
  region: string;
  failureLikelihoodPct: number; // 0 - 100
  predictedHorizon: RiskHorizon;
  leadingIndicator: string; // e.g. "SMART Reallocated Sectors > 95%", "WAN Jitter > 180ms"
  vulnerableComponent: "HDD" | "NETWORK" | "DVR" | "CAMERA" | "POWER";
  confidencePct: number;
  recommendedPreemptiveAction: string;
}

export interface WhatWillBreakAnswer {
  summaryHeadline: string; // e.g. "8 branches high risk within 72 hours"
  highRiskBranchesCount: number;
  moderateRiskBranchesCount: number;
  forecastHorizonHours: number; // 72
  predictions: AtRiskBranchPrediction[];
}

// ─── 3. WHY? (ROOT CAUSE ATTRIBUTION) ────────────────────────────────────────

export type RootCauseCategory = "HDD" | "NETWORK" | "DVR" | "CAMERA" | "POWER";

export interface RootCauseAttribution {
  category: RootCauseCategory;
  displayName: string;
  percentageContribution: number; // 0 - 100
  affectedBranchesCount: number;
  affectedDevicesCount: number;
  primarySymptom: string;
  details: string[];
}

export interface WhyAnswer {
  summaryHeadline: string; // e.g. "Primary Driver: Storage Wear (42%) & Network Jitter (28%)"
  attributions: RootCauseAttribution[];
  dominantCause: RootCauseCategory;
}

// ─── 4. WHAT IS THE BUSINESS IMPACT? ─────────────────────────────────────────

export interface ComplianceRiskItem {
  riskId: string;
  branchId: string;
  branchName: string;
  mandate: string; // e.g. "RBI 90-Day Continuous Recording Mandate"
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  potentialPenaltyEstimate: string;
  details: string;
}

export interface CriticalZoneExposure {
  zoneType: "VAULT" | "ATM" | "CASH_COUNTER" | "ENTRY_GATE" | "LOCKER_ROOM";
  camerasBlind: number;
  branchesAffected: number;
}

export interface BusinessImpactAnswer {
  summaryHeadline: string; // e.g. "63 cameras / 11 branches / 4 compliance risks"
  totalCamerasAffected: number;
  criticalBranchesImpacted: number;
  activeComplianceRisksCount: number;
  complianceRisks: ComplianceRiskItem[];
  criticalZoneExposures: CriticalZoneExposure[];
  estimatedOperationalRiskScore: number; // 0 - 100
}

// ─── 5. WHAT SHOULD I DO? (PRESCRIPTIVE ACTIONS) ─────────────────────────────

export type PrescriptiveActionType =
  | "REPLACE_HDD"
  | "RESTART_DVR"
  | "DISPATCH_TECHNICIAN"
  | "STORAGE_FAILOVER"
  | "RESTORE_CONFIG"
  | "RECONNECT_CAMERA";

export type ActionStatus = "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "DISMISSED";

export interface PrescriptiveAction {
  actionId: string;
  type: PrescriptiveActionType;
  title: string; // e.g. "Replace 4 HDDs", "Restart 3 DVRs"
  description: string;
  targetBranchIds: string[];
  targetDeviceIds: string[];
  urgency: "P0_IMMEDIATE" | "P1_TODAY" | "P2_PLANNED";
  estimatedTimeToResolveMinutes: number;
  status: ActionStatus;
  isOneClickExecutable: boolean;
  executionPayload?: Record<string, unknown>;
  createdAt: Date;
  executedAt?: Date;
  executedBy?: string;
  executionResult?: string;
}

export interface WhatShouldIDoAnswer {
  summaryHeadline: string; // e.g. "Replace 4 HDDs • Restart 3 DVRs • Dispatch technician to 2 branches"
  immediateActionsCount: number;
  actions: PrescriptiveAction[];
}

// ─── MASTER SNAPSHOT ─────────────────────────────────────────────────────────

export interface CeoScreenSnapshot {
  timestamp: Date;
  overallStatus: "RED" | "AMBER" | "GREEN";
  // The 5 Core Answers
  whatIsBroken: WhatIsBrokenAnswer;
  whatWillBreak: WhatWillBreakAnswer;
  why: WhyAnswer;
  businessImpact: BusinessImpactAnswer;
  whatShouldIDo: WhatShouldIDoAnswer;
}
