import type {
  AlertEvidence,
  AlertEvidenceFailure,
  EvidenceState,
} from "../domain/operational-alert.types.js";
import {
  EvidenceCapturePipelineService,
  evidenceCapturePipelineService,
} from "../../evidence/services/evidence-capture-pipeline.service.js";
import type { EvidenceFailureCode } from "../../evidence/domain/evidence.types.js";

export interface EvidenceJobOptions {
  alertId: string;
  tenantId: string;
  branchId: string;
  cameraId?: string | undefined;
  occurredAt: Date;
  preEventSeconds?: number | undefined;
  postEventSeconds?: number | undefined;
  mockFailure?: "RECORDER_OFFLINE" | "NO_RECORDING_FOUND" | "TIMEOUT" | undefined;
}

function mapFailureReason(code?: EvidenceFailureCode): AlertEvidenceFailure["reason"] {
  switch (code) {
    case "RECORDER_OFFLINE":
    case "EDGE_GATEWAY_OFFLINE":
      return "RECORDER_OFFLINE";
    case "RECORDING_NOT_FOUND":
    case "ARCHIVE_SEARCH_FAILED":
      return "NO_RECORDING_FOUND";
    case "EXPORT_TIMEOUT":
      return "TIMEOUT";
    case "VIDEO_CORRUPTED":
    case "HASH_FAILED":
      return "CORRUPTED_RECORDING";
    case "UNSUPPORTED_CAPABILITY":
      return "UNSUPPORTED_API";
    default:
      return "UNKNOWN";
  }
}

/**
 * Alert Evidence Pipeline Service (Facade)
 *
 * @deprecated Legacy alert evidence pipeline facade.
 * Delegates all physical evidence capture, SHA-256 integrity verification,
 * and outbox storage to the authoritative `EvidenceCapturePipelineService`.
 */
export class AlertEvidencePipelineService {
  constructor(
    private readonly pipeline: EvidenceCapturePipelineService = evidenceCapturePipelineService,
  ) {}

  async initiateCapture(
    options: EvidenceJobOptions,
    onProgress?: (evidence: AlertEvidence) => void,
  ): Promise<AlertEvidence> {
    const preSec = options.preEventSeconds ?? 15;
    const postSec = options.postEventSeconds ?? 30;

    // 1. Initial State: QUEUED
    let evidence: AlertEvidence = {
      state: "QUEUED",
      snapshotState: "QUEUED",
      clipState: "QUEUED",
      preEventSeconds: preSec,
      postEventSeconds: postSec,
    };
    onProgress?.(evidence);

    try {
      const record = await this.pipeline.enqueueEvidenceCapture({
        alertId: options.alertId,
        tenantId: options.tenantId,
        branchId: options.branchId,
        cameraId: options.cameraId || "unknown",
        alertType: "OPERATIONAL_ALERT",
        severity: "P2",
        detectedAt: options.occurredAt,
      });

      const stateMap: Record<string, EvidenceState> = {
        QUEUED: "QUEUED",
        CAPTURING: "CAPTURING",
        VERIFYING: "CAPTURING",
        READY: "READY",
        PARTIAL: "READY",
        FAILED: "FAILED",
      };

      evidence = {
        state: stateMap[record.status] || "READY",
        snapshotState: record.snapshot ? "READY" : "FAILED",
        clipState: record.videoClip ? "READY" : "FAILED",
        snapshotUrl: record.snapshot?.url || `/media/snapshots/${options.alertId}.jpg`,
        clipUrl: record.videoClip?.url || `/media/clips/${options.alertId}.mp4`,
        clipDurationSeconds: preSec + postSec,
        preEventSeconds: preSec,
        postEventSeconds: postSec,
        capturedAt: record.completedAt || new Date(),
        failure:
          record.status === "FAILED"
            ? {
                stage: "ARCHIVE_SEARCH",
                reason: mapFailureReason(record.failureCode as EvidenceFailureCode),
                message: record.failureReason || "Evidence extraction failed",
              }
            : undefined,
      };

      onProgress?.(evidence);
      return evidence;
    } catch (err: any) {
      evidence = {
        ...evidence,
        state: "FAILED",
        snapshotState: "FAILED",
        clipState: "FAILED",
        failure: {
          stage: "ARCHIVE_SEARCH",
          reason: "TIMEOUT",
          message: err.message || "Failed to capture evidence from recording pipeline",
        },
        capturedAt: new Date(),
      };
      onProgress?.(evidence);
      return evidence;
    }
  }
}

export const alertEvidencePipelineService = new AlertEvidencePipelineService();
