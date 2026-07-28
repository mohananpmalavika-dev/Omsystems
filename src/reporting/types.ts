export type OperationalReportFormat = "csv" | "xlsx" | "pdf";
export type OperationalReportRunStatus = "queued" | "running" | "completed" | "failed" | "dead";

export interface OperationalReportFilters {
  region?: string;
  branchId?: string;
  deviceStatus?: "healthy" | "warning" | "critical" | "unknown";
  alertType?: string;
  severity?: "P1" | "P2" | "P3" | "P4" | "P5";
  alertState?: string;
  from?: string;
  to?: string;
}

export interface OperationalReportSchedule {
  id: string; tenantId: string; name: string; timezone: string; dailyAt: string;
  formats: OperationalReportFormat[]; recipients: string[]; filters: OperationalReportFilters;
  enabled: boolean; lastRunAt: string | null; nextRunAt: string; createdBy: string;
  createdAt: string; updatedAt: string;
}

export interface OperationalReportRun {
  id: string; tenantId: string; scheduleId: string | null; requestedBy: string;
  status: OperationalReportRunStatus; formats: OperationalReportFormat[];
  filters: OperationalReportFilters; recipients: string[]; progress: number;
  attempts: number; maxAttempts: number; nextAttemptAt: string; rowCount: number | null;
  summary: Record<string, unknown> | null; error: string | null; startedAt: string | null;
  completedAt: string | null; createdAt: string; updatedAt: string;
}

export interface OperationalReportArtifact {
  id: string; tenantId: string; runId: string; format: OperationalReportFormat;
  filename: string; storagePath: string; contentType: string; sizeBytes: number;
  checksumSha256: string; expiresAt: string; createdAt: string;
}

export interface OperationalReportDelivery {
  id: string; tenantId: string; runId: string; recipient: string;
  status: "queued" | "processing" | "delivered" | "failed" | "dead";
  attempts: number; nextAttemptAt: string; providerId: string | null; error: string | null;
  deliveredAt: string | null; createdAt: string; updatedAt: string;
}

export interface DailyOperationalReport {
  generatedAt: string;
  period: { from: string; to: string };
  filters: OperationalReportFilters;
  summary: {
    totalBranches: number; healthyBranches: number; warningBranches: number;
    criticalBranches: number; unknownBranches: number; totalCameras: number;
    camerasOnline: number; camerasOffline: number; camerasDegradedOrUnknown: number;
    retentionBreaches: number; recorderExceptions: number; diskExceptions: number;
    internetExceptions: number; alertCount: number; unacknowledgedAlerts: number;
    escalatedAlerts: number; slaBreaches: number;
  };
  branches: Array<Record<string, string | number | null>>;
  cameras: Array<Record<string, string | number | boolean | null>>;
  alerts: Array<Record<string, string | number | null>>;
  exceptions: Array<Record<string, string | number | null>>;
}
