import { randomUUID } from "node:crypto";
import type {
  AlertEvidenceRecord,
  EvidenceCaptureSource,
  EvidenceManifest,
  EvidenceSlaSummary,
} from "../domain/evidence.types.js";
import { EvidenceHashVerifierService } from "./evidence-hash-verifier.service.js";
import { EvidencePolicyService, evidencePolicyService } from "./evidence-policy.service.js";
import { EvidenceStorageService, evidenceStorageService } from "./evidence-storage.service.js";
import { HttpAlertEvidenceClient, type AlertEvidenceClient, type AlertEvidenceKind } from "../../alerts/evidence-capture.js";

export interface EvidenceJobRequest {
  alertId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  alertType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  detectedAt?: Date;
  preferredSource?: EvidenceCaptureSource;
}

/** Captures only bytes returned by the configured recording engine. */
export class EvidenceCapturePipelineService {
  private readonly evidenceRecords = new Map<string, AlertEvidenceRecord>();
  private readonly manifests = new Map<string, EvidenceManifest>();
  private readonly latencies: { snapshotMs: number[]; completeMs: number[] } = { snapshotMs: [], completeMs: [] };

  constructor(
    private readonly policyService: EvidencePolicyService = evidencePolicyService,
    private readonly storageService: EvidenceStorageService = evidenceStorageService,
    private readonly recordingClient?: AlertEvidenceClient,
  ) {}

  async enqueueEvidenceCapture(request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    const existing = this.evidenceRecords.get(request.alertId);
    if (existing && ["READY", "CAPTURING", "QUEUED"].includes(existing.status)) return existing;

    const detectedAt = request.detectedAt ?? new Date();
    const policy = this.policyService.getPolicy(request.alertType, request.severity);
    const record: AlertEvidenceRecord = {
      id: `ev-${randomUUID()}`,
      alertId: request.alertId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      cameraId: request.cameraId,
      status: "QUEUED",
      requestedStartAt: new Date(detectedAt.getTime() - policy.preEventSeconds * 1000),
      requestedEndAt: new Date(detectedAt.getTime() + policy.postEventSeconds * 1000),
      detectedAt,
      preEventSeconds: policy.preEventSeconds,
      postEventSeconds: policy.postEventSeconds,
      attemptCount: 1,
      maxAttempts: policy.retryCount,
      createdAt: new Date(),
    };
    this.evidenceRecords.set(request.alertId, record);
    return this.executeCapture(record, request);
  }

  async executeCapture(record: AlertEvidenceRecord, request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    const startTime = Date.now();
    record.status = "CAPTURING";
    if (!this.recordingClient) {
      return this.fail(record, "UNSUPPORTED_CAPABILITY", "Recording-engine evidence client is not configured", startTime);
    }

    try {
      const requestedDuration = record.preEventSeconds + record.postEventSeconds;
      const capture = await this.recordingClient.capture({
        alertId: record.alertId,
        cameraId: record.cameraId,
        occurredAt: record.detectedAt.toISOString(),
        clipSeconds: requestedDuration,
      });
      if (capture.state === "failed") {
        return this.fail(record, "ARCHIVE_SEARCH_FAILED", capture.error ?? "Recording engine rejected evidence capture", startTime);
      }
      if (capture.state === "queued" || capture.state === "capturing") {
        record.status = "CAPTURING";
        record.latencyMs = Date.now() - startTime;
        this.evidenceRecords.set(record.alertId, record);
        return record;
      }

      if (capture.snapshotAvailable) {
        record.snapshot = await this.persistRemoteAsset(record, "snapshot", "snapshot.jpg", "image/jpeg");
        this.latencies.snapshotMs.push(Date.now() - startTime);
      }
      if (capture.clipAvailable) {
        record.videoClip = await this.persistRemoteAsset(record, "clip", "evidence_clip.mp4", "video/mp4", requestedDuration);
      }

      record.captureSource = request.preferredSource ?? "RECORDER_ARCHIVE";
      record.status = record.snapshot && record.videoClip ? "READY" : record.snapshot || record.videoClip ? "PARTIAL" : "FAILED";
      if (record.status === "FAILED") {
        record.failureCode = "RECORDING_NOT_FOUND";
        record.failureReason = "Recording engine returned no evidence assets";
      }
      record.completedAt = new Date();
      record.latencyMs = Date.now() - startTime;
      this.latencies.completeMs.push(record.latencyMs);
      this.evidenceRecords.set(record.alertId, record);
      return record;
    } catch (error) {
      return this.fail(record, "ARCHIVE_SEARCH_FAILED", error instanceof Error ? error.message : "Evidence capture failed", startTime);
    }
  }

  async getEvidenceForAlert(alertId: string): Promise<AlertEvidenceRecord | null> {
    return this.evidenceRecords.get(alertId) ?? null;
  }

  async getManifest(evidenceId: string): Promise<EvidenceManifest | null> {
    return this.manifests.get(evidenceId) ?? null;
  }

  async getSlaSummary(): Promise<EvidenceSlaSummary> {
    const list = [...this.evidenceRecords.values()];
    const snapshotLatencies = [...this.latencies.snapshotMs].sort((a, b) => a - b);
    const completeLatencies = [...this.latencies.completeMs].sort((a, b) => a - b);
    const failureBreakdown: Record<string, number> = {};
    for (const record of list) if (record.failureCode) failureBreakdown[record.failureCode] = (failureBreakdown[record.failureCode] ?? 0) + 1;
    const ready = list.filter((record) => record.status === "READY").length;
    return {
      totalRequested: list.length,
      completedReady: ready,
      completedPartial: list.filter((record) => record.status === "PARTIAL").length,
      failedCount: list.filter((record) => record.status === "FAILED").length,
      readyPercentage: list.length > 0 ? Math.round((ready / list.length) * 10_000) / 100 : 0,
      medianSnapshotLatencyMs: percentile(snapshotLatencies, 0.5),
      p95SnapshotLatencyMs: percentile(snapshotLatencies, 0.95),
      medianCompleteEvidenceLatencyMs: percentile(completeLatencies, 0.5),
      p95CompleteEvidenceLatencyMs: percentile(completeLatencies, 0.95),
      failureBreakdown,
    };
  }

  private async persistRemoteAsset(
    record: AlertEvidenceRecord,
    kind: AlertEvidenceKind,
    filename: string,
    defaultMimeType: string,
    durationSeconds?: number,
  ) {
    if (!this.recordingClient) throw new Error("Recording-engine evidence client is not configured");
    const response = await this.recordingClient.asset(record.alertId, kind);
    if (!response.ok) throw new Error(`Recording-engine ${kind} request failed (${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) throw new Error(`Recording-engine ${kind} response was empty`);
    const sha256 = EvidenceHashVerifierService.computeSha256(data);
    const storageKey = this.storageService.formatStorageKey({
      tenantId: record.tenantId,
      branchId: record.branchId,
      alertId: record.alertId,
      filename,
      date: record.detectedAt,
    });
    return this.storageService.putAsset({
      storageKey,
      data,
      mimeType: response.headers.get("content-type") ?? defaultMimeType,
      type: kind === "snapshot" ? "SNAPSHOT" : "VIDEO_CLIP",
      sha256,
      durationSeconds,
    });
  }

  private fail(record: AlertEvidenceRecord, code: AlertEvidenceRecord["failureCode"], reason: string, startTime: number) {
    record.status = "FAILED";
    record.failureCode = code;
    record.failureReason = reason;
    record.completedAt = new Date();
    record.latencyMs = Date.now() - startTime;
    this.evidenceRecords.set(record.alertId, record);
    return record;
  }
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;
}

const recordingEvidenceClient = process.env.RECORDING_ENGINE_URL && process.env.RECORDING_ENGINE_SHARED_KEY
  ? new HttpAlertEvidenceClient(process.env.RECORDING_ENGINE_URL, process.env.RECORDING_ENGINE_SHARED_KEY)
  : undefined;

export const evidenceCapturePipeline = new EvidenceCapturePipelineService(
  evidencePolicyService,
  evidenceStorageService,
  recordingEvidenceClient,
);
export const evidenceCapturePipelineService = evidenceCapturePipeline;
