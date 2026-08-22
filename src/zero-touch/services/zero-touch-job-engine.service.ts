/**
 * Legacy Zero-Touch facade.
 *
 * The authoritative provisioning implementation is the persisted edge scan
 * job API in the control plane. This facade is retained for compatibility
 * with older clients, but it never seeds fleet data or fabricates discovery,
 * telemetry, certificates, stream validation, or recording evidence.
 */

import { EventEmitter } from "node:events";
import type {
  ProvisioningJob,
  FleetSlaMetrics,
  BranchFleetSummary,
  DiscoveredDeviceReviewItem,
  ProvisioningDiagnosticReport,
} from "../domain/zero-touch.types.js";

export class ZeroTouchProvisioningUnavailableError extends Error {
  readonly code = "legacy_zero_touch_disabled";

  constructor() {
    super("Legacy zero-touch execution is disabled. Queue a persisted edge scan through /v1/branches/:branchId/scan-jobs.");
    this.name = "ZeroTouchProvisioningUnavailableError";
  }
}

export class ZeroTouchJobEngineService extends EventEmitter {
  private readonly jobs = new Map<string, ProvisioningJob>();
  private readonly discoveredDevicesByBranch = new Map<string, DiscoveredDeviceReviewItem[]>();
  private readonly branchSummaries = new Map<string, BranchFleetSummary>();
  private readonly diagnosticReports = new Map<string, ProvisioningDiagnosticReport>();

  public listBranches(): BranchFleetSummary[] {
    return Array.from(this.branchSummaries.values());
  }

  public getBranch(branchId: string): BranchFleetSummary | undefined {
    return this.branchSummaries.get(branchId);
  }

  /** Compatibility-only local profile. Production branch creation belongs to the control-plane store. */
  public createBranch(data: { branchId: string; branchName: string; region?: string }): BranchFleetSummary {
    const summary: BranchFleetSummary = {
      branchId: data.branchId,
      branchName: data.branchName,
      region: data.region ?? "",
      agentStatus: "NOT_ENROLLED",
      totalDevices: 0,
      totalCameras: 0,
      readinessScorePct: 0,
      operationalStatus: "UNENROLLED",
    };
    this.branchSummaries.set(data.branchId, summary);
    return summary;
  }

  public getFleetSlaMetrics(): FleetSlaMetrics {
    const completedJobs = Array.from(this.jobs.values()).filter((job) =>
      job.status === "COMPLETED" || job.status === "PARTIALLY_READY",
    );
    const durations = completedJobs
      .map((job) => job.totalDurationSeconds)
      .filter((value): value is number => Number.isFinite(value))
      .sort((a, b) => a - b);
    const percentile = (ratio: number) => durations.length === 0 ? 0 : durations[Math.min(durations.length - 1, Math.floor(durations.length * ratio))]!;
    const withinSla = durations.filter((duration) => duration <= 90).length;

    return {
      targetSlaSeconds: 90,
      lastProvisioningSeconds: durations.at(-1) ?? 0,
      fleetAverageSeconds: durations.length === 0 ? 0 : Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)),
      p50Seconds: percentile(0.5),
      p95Seconds: percentile(0.95),
      totalBranchesProvisioned: completedJobs.length,
      activeProvisioningJobs: Array.from(this.jobs.values()).filter((job) => ["DISCOVERING", "VALIDATING", "REGISTERING"].includes(job.status)).length,
      slaAdherencePct: durations.length === 0 ? 0 : Number(((withinSla / durations.length) * 100).toFixed(1)),
    };
  }

  public listJobs(branchId?: string): ProvisioningJob[] {
    const jobs = Array.from(this.jobs.values()).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return branchId ? jobs.filter((job) => job.branchId === branchId) : jobs;
  }

  public getJob(jobId: string): ProvisioningJob | undefined {
    return this.jobs.get(jobId);
  }

  public getDiscoveredDevices(branchId: string): DiscoveredDeviceReviewItem[] {
    return this.discoveredDevicesByBranch.get(branchId) ?? [];
  }

  /**
   * Kept only as a compatibility guard. The real control-plane scan route
   * persists a job and waits for an enrolled edge agent to execute it.
   */
  public async startProvisioningJob(_params: {
    branchId: string;
    agentId?: string;
    scannedSubnets?: string[];
    createdBy?: string;
  }): Promise<ProvisioningJob> {
    throw new ZeroTouchProvisioningUnavailableError();
  }

  public cancelJob(_jobId: string): boolean {
    return false;
  }

  public async retryJob(_jobId: string): Promise<ProvisioningJob | undefined> {
    throw new ZeroTouchProvisioningUnavailableError();
  }

  public getDiagnostics(branchId: string): ProvisioningDiagnosticReport | undefined {
    return this.diagnosticReports.get(branchId);
  }

  /** Allows a real ingestion adapter to publish an observed device set. */
  public recordDiscoveredDevices(branchId: string, devices: DiscoveredDeviceReviewItem[]): void {
    this.discoveredDevicesByBranch.set(branchId, devices);
  }

  /** Allows a real diagnostic adapter to publish observed probes. */
  public recordDiagnostics(report: ProvisioningDiagnosticReport): void {
    this.diagnosticReports.set(report.branchId, report);
  }
}

export const zeroTouchJobEngineService = new ZeroTouchJobEngineService();
