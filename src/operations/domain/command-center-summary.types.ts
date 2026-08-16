/**
 * Unified Surveillance Operating System Domain Contracts
 * 
 * Provides unified operational read models, attention matrix, 360-degree branch workspace,
 * and universal entity search.
 */

import type { OperationalStatus } from "../../maintenance/domain/maintenance-window.types.js";

export interface AttentionRequiredItem {
  id: string;
  category: "P1_ALERT" | "RECORDING_FAILURE" | "RETENTION_VIOLATION" | "INTERNET_OUTAGE" | "STORAGE_CRITICAL" | "MASS_INCIDENT";
  severity: "P1" | "P2" | "CRITICAL" | "WARNING";
  branchId: string;
  branchName: string;
  entityId: string;
  entityType: "CAMERA" | "RECORDER" | "STORAGE" | "INTERNET" | "INCIDENT" | "ALERT";
  title: string;
  description: string;
  occurredAt: Date;
  actionUrl: string;
}

export interface CommandCenterSummary {
  generatedAt: Date;

  branches: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
    maintenance: number;
    unknown: number;
  };

  cameras: {
    total: number;
    healthy: number;
    offline: number;
    recordingFailure: number;
    maintenance: number;
    unknown: number;
  };

  recorders: {
    total: number;
    online: number;
    offline: number;
    maintenance: number;
  };

  storage: {
    totalDisks: number;
    healthy: number;
    warning: number;
    critical: number;
  };

  retention: {
    requiredDays: number;
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
  operationalState: OperationalStatus;

  internet: {
    state: string;
    mode: string;
    latencyMs: number;
  };

  cameras: {
    total: number;
    healthy: number;
    offline: number;
    notRecording: number;
    maintenance: number;
  };

  recorders: {
    total: number;
    online: number;
    offline: number;
  };

  storage: {
    diskCount: number;
    state: string;
    minFreePercent: number;
  };

  retention: {
    requiredDays: number;
    observedDays: number;
    compliant: boolean;
  };

  alerts: {
    p1: number;
    p2: number;
  };

  openIncidents: number;
  lastReportedAt: Date;
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
