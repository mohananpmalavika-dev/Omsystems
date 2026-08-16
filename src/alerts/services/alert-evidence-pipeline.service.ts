import type {
  AlertEvidence,
  EvidenceState,
} from "../domain/operational-alert.types.js";

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

export class AlertEvidencePipelineService {
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

    // 2. Simulated capturing stage
    evidence = {
      ...evidence,
      state: "CAPTURING",
      snapshotState: "CAPTURING",
      clipState: "CAPTURING",
    };
    onProgress?.(evidence);

    // Mock failure check for edge case testing
    if (options.mockFailure) {
      evidence = {
        ...evidence,
        state: "FAILED",
        snapshotState: "READY",
        snapshotUrl: `/media/snapshots/${options.alertId}.jpg`,
        clipState: "FAILED",
        failure: {
          stage: "ARCHIVE_SEARCH",
          reason: options.mockFailure,
          message:
            options.mockFailure === "NO_RECORDING_FOUND"
              ? `Recorder archive search returned no video clips for ${options.occurredAt.toISOString()} ± ${preSec}s.`
              : `Connection to branch recorder timed out during evidence export.`,
        },
        capturedAt: new Date(),
      };
      onProgress?.(evidence);
      return evidence;
    }

    // 3. Success State
    evidence = {
      state: "READY",
      snapshotState: "READY",
      clipState: "READY",
      snapshotUrl: `/media/snapshots/${options.alertId}.jpg`,
      clipUrl: `/media/clips/${options.alertId}.mp4`,
      clipDurationSeconds: preSec + postSec,
      preEventSeconds: preSec,
      postEventSeconds: postSec,
      capturedAt: new Date(),
    };
    onProgress?.(evidence);

    return evidence;
  }
}
