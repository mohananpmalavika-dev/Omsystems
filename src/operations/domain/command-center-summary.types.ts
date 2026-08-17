/**
 * Unified Surveillance Operating System Domain Contracts
 * 
 * Provides unified operational read models, attention matrix, 360-degree branch workspace,
 * predictive failure intelligence, and universal entity search.
 */

import type { OperationalStatus } from "../../maintenance/domain/maintenance-window.types.js";

export interface AttentionRequiredItem {
  id: string;
  category: "P1_ALERT" | "RECORDING_FAILURE" | "RETENTION_VIOLATION" | "INTERNET_OUTAGE" | "STORAGE_CRITICAL" | "MASS_INCIDENT" | "PREDICTED_FAILURE";
  severity: "P1" | "P2" | "CRITICAL" | "WARNING";
  branchId: string;
  branchName: string;
  entityId: string;
  entityType: "CAMERA" | "RECORDER" | "STORAGE" | "INTERNET" | "INCIDENT" | "ALERT";
  title: string;
  description: string;
  occurredAt: Date;
  actionUrl: string;
  recommendedAction?: string;
  riskProbabilityPct?: number;
}

export interface PredictedFailureItem {
  branchId: string;
  branchName: string;
  region: string;
  failureType: "RECORDING_FAILURE" | "STORAGE_FAILURE" | "NETWORK_OUTAGE" | "CAMERA_CLUSTER_DROP";
  failureProbability: number; // 0 - 100
  expectedWindow: string; // e.g. "24–48 hours"
  likelyCause: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  contributingFactors: Array<{ factor: string; percentage: number }>;
  recommendedAction: string;
}

export interface FleetHealthBreakdown {
  score: number; // 0 - 100
  trendPct: number; // e.g. +2.3% vs yesterday
  subscores: {
    infrastructure: number;
    cameras: number;
    recording: number;
    network: number;
    storage: number;
    retention: number;
  };
}

export interface ChangeSinceYesterday {
  camerasRestored: number;
  camerasOffline: number;
  branchesDegraded: number;
  criticalIncidents: number;
  predictedFailures: number;
}

export interface BusinessImpactSummary {
  branchesAffected: number;
  camerasAffected: number;
  surveillanceExposureMinutes: number;
  complianceRisksCount: number;
  vaultOrAtmExposures: number;
}

export interface LiveIncidentItem {
  id: string;
  severityColor: "RED" | "ORANGE" | "YELLOW" | "BLUE";
  branchCode: string;
  branchName: string;
  headline: string;
  riskPct?: number;
  startedAgo: string;
  actionUrl: string;
}

export interface AiOperationsBriefing {
  status: "NORMAL" | "ANOMALIES_DETECTED" | "CRITICAL_ISSUES";
  headline: string;
  summaryText: string;
  criticalItemsCount: number;
  recommendedAction: string;
  items: Array<{
    branchId: string;
    branchCode: string;
    branchName: string;
    issue: string;
    actionLabel: string;
  }>;
}

export interface CommandCenterSummary {
  generatedAt: Date;
  lastTelemetryTimestamp: string;
  agentHeartbeatSecondsAgo: number;

  // Executive Operational Intelligence Metrics
  fleetHealth: FleetHealthBreakdown;
  predictedFailuresSummary: {
    total: number;
    highRiskCount: number;
    mediumRiskCount: number;
    horizon: string;
    nextLikelyFailure: PredictedFailureItem;
    allPredictions: PredictedFailureItem[];
  };

  atRiskBranchesCount: number;
  atRiskTrend: number;

  changeSinceYesterday: ChangeSinceYesterday;
  businessImpact: BusinessImpactSummary;
  liveIncidents: LiveIncidentItem[];
  aiBriefing: AiOperationsBriefing;

  branches: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
    maintenance: number;
    unprovisioned: number;
    unknown: number;
  };

  cameras: {
    total: number;
    healthy: number;
    offline: number;
    recordingFailure: number;
    maintenance: number;
    unknown: number;
    trendPct: number;
  };

  recording: {
    healthyPct: number;
    trendPct: number;
    totalRecording: number;
    totalFailing: number;
  };

  recorders: {
    total: number;
    online: number;
    offline: number;
    maintenance: number;
  };

  storage: {
    healthyPct: number;
    trendPct: number;
    totalDisks: number;
    healthy: number;
    warning: number;
    critical: number;
  };

  retention: {
    compliancePct: number;
    configuredMandateDays: number;
    policyTag: string; // e.g. "90d ✓" or "180d ✓"
    compliantBranches: number;
    warningBranches: number;
    violationBranches: number;
  };

  network: {
    online: number;
    failoverLte: number;
    offline: number;
  };

  alerts: {
    p1Open: number;
    p2Open: number;
    unacknowledged: number;
    suppressedToday: number;
  };

  incidents: {
    active: number;
    investigating: number;
    resolvedToday: number;
  };

  attentionRequired: AttentionRequiredItem[];
}

export interface BranchOperationalView {
  branchId: string;
  branchCode: string;
  name: string;
  region: string;
  operationalState: OperationalStatus | "NOT_PROVISIONED" | "MONITORING_INCOMPLETE" | "STALE";

  healthScore: number; // 0 - 100

  risk: {
    level: "LOW" | "MEDIUM" | "HIGH";
    probabilityPct?: number;
    horizonHours?: number;
    indicator?: string;
  };

  internet: {
    state: string;
    mode: string;
    latencyMs: number;
    packetLossPct?: number;
    jitterMs?: number;
  };

  cameras: {
    total: number;
    healthy: number;
    offline: number;
    notRecording: number;
    maintenance: number;
  };

  recording: {
    totalChannels: number;
    recordingChannels: number;
    status: "HEALTHY" | "DEGRADED" | "FAILED" | "NOT_PROVISIONED";
  };

  recorders: {
    total: number;
    online: number;
    offline: number;
    temperatureC?: number;
    cpuPct?: number;
  };

  storage: {
    diskCount: number;
    state: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
    minFreePercent: number;
    smartWarningsCount?: number;
    disks?: Array<{ name: string; status: string; smart: string }>;
  };

  retention: {
    requiredDays: number;
    observedDays: number;
    compliant: boolean;
    displayTag: string; // e.g. "90d ✓"
  };

  alerts: {
    p1: number;
    p2: number;
  };

  telemetry: {
    lastReportedAt: Date;
    secondsAgo: number;
    isStale: boolean;
  };

  aiDiagnosis?: string;
  recommendedAction?: string;
  openIncidents: number;
}

export interface Branch360Workspace {
  branch: BranchOperationalView;
  cameras: Array<{
    cameraId: string;
    name: string;
    channelNumber: number;
    zone: string;
    operationalState: OperationalStatus;
    isStreaming: boolean;
    isRecording: boolean;
    fps: number;
    bitrateKbps: number;
    lastRecordedAt?: string | undefined;
  }>;
  recorders: Array<{
    recorderId: string;
    model: string;
    ipAddress: string;
    status: string;
    channelsTotal: number;
    channelsRecording: number;
    clockOffsetSeconds: number;
    temperatureC?: number;
    cpuPct?: number;
  }>;
  disks: Array<{
    diskId: string;
    slot: number;
    capacityTb: number;
    freePercent: number;
    smartStatus: string;
    retentionDays: number;
  }>;
  network: {
    primaryIsp: string;
    backupIsp: string;
    currentMode: string;
    latencyMs: number;
    packetLossPct: number;
    jitterMs?: number;
    vpnConnected: boolean;
  };
  activeAlerts: Array<{
    id: string;
    severity: string;
    title: string;
    detectedAt: Date;
    status: string;
  }>;
  activeIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    startedAt: Date;
    status: string;
  }>;
  aiDiagnosis?: string;
  recommendedAction?: string;
}

export interface UniversalSearchResult {
  query: string;
  matches: Array<{
    entityType: "BRANCH" | "CAMERA" | "RECORDER" | "ALERT" | "INCIDENT" | "INVESTIGATION";
    entityId: string;
    title: string;
    subtitle: string;
    status?: string | undefined;
    branchId?: string | undefined;
    navigationUrl: string;
  }>;
}
