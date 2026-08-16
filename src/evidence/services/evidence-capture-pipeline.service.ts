import type {
  AlertEvidenceRecord,
  EvidenceCaptureSource,
  EvidenceFailureCode,
  EvidenceManifest,
  EvidenceSlaSummary,
  EvidenceStatus,
} from "../domain/evidence.types.js";
import { EvidenceHashVerifierService } from "./evidence-hash-verifier.service.js";
import { EvidencePolicyService, evidencePolicyService } from "./evidence-policy.service.js";
import { EvidenceStorageService, evidenceStorageService } from "./evidence-storage.service.js";

export interface EvidenceJobRequest {
  alertId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  alertType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  detectedAt?: Date | undefined;
  preferredSource?: EvidenceCaptureSource | undefined;
  mockFailureCode?: EvidenceFailureCode | undefined;
}

export class EvidenceCapturePipelineService {
  private readonly evidenceRecords = new Map<string, AlertEvidenceRecord>(); // key: alertId
  private readonly manifests = new Map<string, EvidenceManifest>(); // key: evidenceId
  private readonly latencies: { snapshotMs: number[]; completeMs: number[] } = {
    snapshotMs: [],
    completeMs: [],
  };

  constructor(
    private readonly policyService: EvidencePolicyService = evidencePolicyService,
    private readonly storageService: EvidenceStorageService = evidenceStorageService,
  ) {
    this.seedDefaultEvidence();
  }

  async enqueueEvidenceCapture(request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    // 1. Idempotency Check
    const existing = this.evidenceRecords.get(request.alertId);
    if (existing && (existing.status === "READY" || existing.status === "CAPTURING")) {
      return existing;
    }

    const detectedAt = request.detectedAt ?? new Date();
    const policy = this.policyService.getPolicy(request.alertType, request.severity);

    const requestedStartAt = new Date(detectedAt.getTime() - policy.preEventSeconds * 1000);
    const requestedEndAt = new Date(detectedAt.getTime() + policy.postEventSeconds * 1000);

    const evidenceId = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: AlertEvidenceRecord = {
      id: evidenceId,
      alertId: request.alertId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      cameraId: request.cameraId,
      status: "QUEUED",
      requestedStartAt,
      requestedEndAt,
      detectedAt,
      preEventSeconds: policy.preEventSeconds,
      postEventSeconds: policy.postEventSeconds,
      attemptCount: 1,
      maxAttempts: policy.retryCount,
      createdAt: new Date(),
    };

    this.evidenceRecords.set(request.alertId, record);

    // 2. Execute capture synchronously/asynchronously
    return this.executeCapture(record, request);
  }

  async executeCapture(record: AlertEvidenceRecord, request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    record.status = "CAPTURING";
    const startTime = Date.now();

    // Check for simulated failure
    if (request.mockFailureCode) {
      record.status = "FAILED";
      record.failureCode = request.mockFailureCode;
      record.failureReason = `Evidence extraction failed: ${request.mockFailureCode}`;
      record.completedAt = new Date();
      record.latencyMs = Date.now() - startTime;
      return record;
    }

    // 1. Immediate Snapshot Capture (T0)
    const snapshotBuffer = Buffer.from(`DUMMY_SNAPSHOT_IMAGE_DATA_${record.alertId}_${record.cameraId}`);
    const snapSha256 = EvidenceHashVerifierService.computeSha256(snapshotBuffer);
    const snapKey = this.storageService.formatStorageKey({
      tenantId: record.tenantId,
      branchId: record.branchId,
      alertId: record.alertId,
      filename: "snapshot.jpg",
      date: record.detectedAt,
    });

    const snapshotAsset = await this.storageService.putAsset({
      storageKey: snapKey,
      data: snapshotBuffer,
      mimeType: "image/jpeg",
      type: "SNAPSHOT",
      sha256: snapSha256,
    });

    record.snapshot = snapshotAsset;
    const snapLatency = Date.now() - startTime;
    this.latencies.snapshotMs.push(snapLatency);

    // 2. Video Extraction with Strategy Fallback
    const totalClipDuration = record.preEventSeconds + record.postEventSeconds;
    const clipBuffer = Buffer.from(`DUMMY_MP4_VIDEO_CLIP_STREAM_${record.alertId}_${totalClipDuration}s`);
    const clipSha256 = EvidenceHashVerifierService.computeSha256(clipBuffer);
    const clipKey = this.storageService.formatStorageKey({
      tenantId: record.tenantId,
      branchId: record.branchId,
      alertId: record.alertId,
      filename: "evidence_clip.mp4",
      date: record.detectedAt,
    });

    const clipAsset = await this.storageService.putAsset({
      storageKey: clipKey,
      data: clipBuffer,
      mimeType: "video/mp4",
      type: "VIDEO_CLIP",
      sha256: clipSha256,
      durationSeconds: totalClipDuration,
    });

    record.videoClip = clipAsset;
    record.actualStartAt = record.requestedStartAt;
    record.actualEndAt = record.requestedEndAt;
    record.captureSource = request.preferredSource ?? "RECORDER_ARCHIVE";

    // 3. Media Verification Stage
    record.status = "VERIFYING";
    const verification = EvidenceHashVerifierService.verifyMediaAsset({
      data: clipBuffer,
      expectedMinSizeBytes: 10,
      expectedMinDurationSeconds: totalClipDuration * 0.9,
      actualDurationSeconds: totalClipDuration,
    });

    if (verification.valid) {
      record.status = "READY";
    } else {
      record.status = "PARTIAL";
      record.failureCode = "INSUFFICIENT_PRE_EVENT";
    }

    // 4. Generate Tamper-Evident Manifest
    const manifest = EvidenceHashVerifierService.generateManifest({
      evidenceId: record.id,
      alertId: record.alertId,
      branchId: record.branchId,
      cameraId: record.cameraId,
      detectedAt: record.detectedAt.toISOString(),
      requestedWindow: {
        start: record.requestedStartAt.toISOString(),
        end: record.requestedEndAt.toISOString(),
      },
      actualWindow: {
        start: record.actualStartAt.toISOString(),
        end: record.actualEndAt.toISOString(),
      },
      snapshot: {
        sha256: snapshotAsset.sha256,
        sizeBytes: snapshotAsset.sizeBytes,
        url: snapshotAsset.url,
      },
      video: {
        sha256: clipAsset.sha256,
        durationSeconds: totalClipDuration,
        sizeBytes: clipAsset.sizeBytes,
        url: clipAsset.url,
      },
      source: record.captureSource,
      generatedAt: new Date().toISOString(),
    });

    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const manifestKey = this.storageService.formatStorageKey({
      tenantId: record.tenantId,
      branchId: record.branchId,
      alertId: record.alertId,
      filename: "manifest.json",
      date: record.detectedAt,
    });

    const manifestAsset = await this.storageService.putAsset({
      storageKey: manifestKey,
      data: manifestBuffer,
      mimeType: "application/json",
      type: "MANIFEST",
      sha256: manifest.manifestSha256,
    });

    record.manifest = manifestAsset;
    record.manifestHash = manifest.manifestSha256;
    this.manifests.set(record.id, manifest);

    record.completedAt = new Date();
    const completeLatency = Date.now() - startTime;
    record.latencyMs = completeLatency;
    this.latencies.completeMs.push(completeLatency);

    this.evidenceRecords.set(record.alertId, record);
    return record;
  }

  async getEvidenceForAlert(alertId: string): Promise<AlertEvidenceRecord | null> {
    return this.evidenceRecords.get(alertId) ?? null;
  }

  async getManifest(evidenceId: string): Promise<EvidenceManifest | null> {
    return this.manifests.get(evidenceId) ?? null;
  }

  async getSlaSummary(): Promise<EvidenceSlaSummary> {
    const list = Array.from(this.evidenceRecords.values());
    const total = list.length;
    const ready = list.filter((e) => e.status === "READY").length;
    const partial = list.filter((e) => e.status === "PARTIAL").length;
    const failed = list.filter((e) => e.status === "FAILED").length;

    const snapSorted = [...this.latencies.snapshotMs].sort((a, b) => a - b);
    const compSorted = [...this.latencies.completeMs].sort((a, b) => a - b);

    const medianSnap: number = (snapSorted.length > 0 ? snapSorted[Math.floor(snapSorted.length / 2)] : 120) ?? 120;
    const p95Snap: number = (snapSorted.length > 0 ? snapSorted[Math.floor(snapSorted.length * 0.95)] : 450) ?? 450;
    const medianComp: number = (compSorted.length > 0 ? compSorted[Math.floor(compSorted.length / 2)] : 1200) ?? 1200;
    const p95Comp: number = (compSorted.length > 0 ? compSorted[Math.floor(compSorted.length * 0.95)] : 2800) ?? 2800;

    const failureBreakdown: Record<string, number> = {};
    for (const e of list) {
      if (e.failureCode) {
        failureBreakdown[e.failureCode] = (failureBreakdown[e.failureCode] ?? 0) + 1;
      }
    }

    return {
      totalRequested: total,
      completedReady: ready,
      completedPartial: partial,
      failedCount: failed,
      readyPercentage: total === 0 ? 100 : Math.round((ready / total) * 10000) / 100,
      medianSnapshotLatencyMs: medianSnap,
      p95SnapshotLatencyMs: p95Snap,
      medianCompleteEvidenceLatencyMs: medianComp,
      p95CompleteEvidenceLatencyMs: p95Comp,
      failureBreakdown,
    };
  }

  private seedDefaultEvidence() {
    const now = new Date();

    // 1. Intrusion Alert P1
    this.enqueueEvidenceCapture({
      alertId: "alert-intrusion-p1-001",
      tenantId: "tenant-bank-01",
      branchId: "branch-thrissur-14",
      cameraId: "cam-vault-01",
      alertType: "intrusion",
      severity: "P1",
      detectedAt: new Date(now.getTime() - 3600_000),
    });
  }
}

export const evidenceCapturePipeline = new EvidenceCapturePipelineService();
