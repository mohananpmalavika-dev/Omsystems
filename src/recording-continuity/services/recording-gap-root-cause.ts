/**
 * Recording Gap Root-Cause Classifier
 * 
 * Correlates detected recording gaps against concurrent telemetry from
 * recorders, cameras, storage arrays, network gateways, and clock offset trackers.
 */

import type { RecordingGap, RecordingGapCause } from "../domain/recording-continuity.types.js";

export interface TelemetryContext {
  recorderOfflineWindows?: Array<{ start: Date; end: Date }> | undefined;
  cameraOfflineWindows?: Array<{ start: Date; end: Date }> | undefined;
  storageFailureWindows?: Array<{ start: Date; end: Date }> | undefined;
  networkOutageWindows?: Array<{ start: Date; end: Date }> | undefined;
  clockStepEvents?: Array<{ timestamp: Date; deltaSeconds: number }> | undefined;
}

export class RecordingGapRootCauseClassifier {
  static classify(gap: RecordingGap, context?: TelemetryContext | undefined): { cause: RecordingGapCause; confidence: "HIGH" | "MEDIUM" | "LOW" } {
    if (!context) {
      return { cause: "UNKNOWN", confidence: "LOW" };
    }

    const gapStart = gap.start.getTime();
    const gapEnd = gap.end.getTime();

    // 1. Check if Recorder was offline during the gap
    if (context.recorderOfflineWindows) {
      const match = context.recorderOfflineWindows.some(
        (w) => w.start.getTime() <= gapEnd && w.end.getTime() >= gapStart
      );
      if (match) {
        return { cause: "RECORDER_OFFLINE", confidence: "HIGH" };
      }
    }

    // 2. Check if Storage Array or HDD had an active failure during the gap
    if (context.storageFailureWindows) {
      const match = context.storageFailureWindows.some(
        (w) => w.start.getTime() <= gapEnd && w.end.getTime() >= gapStart
      );
      if (match) {
        return { cause: "STORAGE_FAILURE", confidence: "HIGH" };
      }
    }

    // 3. Check if Camera was unreachable / stream lost
    if (context.cameraOfflineWindows) {
      const match = context.cameraOfflineWindows.some(
        (w) => w.start.getTime() <= gapEnd && w.end.getTime() >= gapStart
      );
      if (match) {
        return { cause: "CAMERA_OFFLINE", confidence: "HIGH" };
      }
    }

    // 4. Check if Network / WAN was down
    if (context.networkOutageWindows) {
      const match = context.networkOutageWindows.some(
        (w) => w.start.getTime() <= gapEnd && w.end.getTime() >= gapStart
      );
      if (match) {
        return { cause: "NETWORK_FAILURE", confidence: "HIGH" };
      }
    }

    // 5. Check if Clock Discontinuity / time step occurred
    if (context.clockStepEvents) {
      const match = context.clockStepEvents.some(
        (e) => e.timestamp.getTime() >= gapStart - 10000 && e.timestamp.getTime() <= gapEnd + 10000
      );
      if (match) {
        return { cause: "TIME_DISCONTINUITY", confidence: "HIGH" };
      }
    }

    return { cause: "UNKNOWN", confidence: "LOW" };
  }
}
