import { probeRecorder, type RecorderConfig, type RecorderProbeResult } from "./recorder-probe.js";

/** Preserve observed results, including offline and unavailable evidence. */
export class RecorderHealthCollector {
  async collect(config: RecorderConfig, timeoutMs = 8000): Promise<RecorderProbeResult> {
    const started = Date.now();
    try {
      return await probeRecorder(config, timeoutMs, { includeArchive: true });
    } catch {
      return {
        metrics: { reachable: false, status: "unknown", recordingStatus: "unknown", durationMs: Date.now() - started },
        hddStatus: [], reasonCodes: ["recorder_probe_failed"], channelHealth: [],
        archiveEvidence: (config.archiveRetention?.channels ?? []).map(channel => ({
          cameraId: channel.cameraId, sourceChannel: channel.channel, status: "unavailable",
          oldestContinuousAt: null, newestPlayableAt: null, retentionLowerBound: false,
          coverageComplete: false, continuityGapSeconds: config.archiveRetention?.continuityGapSeconds ?? 0,
          gapCount: 0, largestGapSeconds: 0, searchStartedAt: new Date(started).toISOString(),
          reasonCodes: ["recorder_probe_failed"], playbackVerified: false, playbackFrameDecoded: false,
        })),
      };
    }
  }
}
export const recorderHealthCollector = new RecorderHealthCollector();
