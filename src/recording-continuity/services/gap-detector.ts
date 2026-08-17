/**
 * Gap Detector & Root-Cause Classifier
 * Compares expected recording ranges against actual recorded intervals to detect and classify gaps.
 */

import { randomUUID } from 'node:crypto';
import { TimeInterval, IntervalMerger } from './interval-merger.js';

export type GapClassification =
  | 'UNEXPLAINED'
  | 'CAMERA_OFFLINE'
  | 'RECORDER_OFFLINE'
  | 'NETWORK_OUTAGE'
  | 'STORAGE_FAILURE'
  | 'PLANNED_MAINTENANCE'
  | 'INDEX_FAILURE'
  | 'CORRUPT_MEDIA';

export type GapStatus = 'OPEN' | 'EXPLAINED' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface DetailedRecordingGap {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  detectedAt: Date;
  classification: GapClassification;
  status: GapStatus;
  incidentId?: string;
  notes?: string;
}

export class GapDetector {
  /**
   * Detects all recording gaps by computing the difference between expected intervals and recorded intervals.
   */
  static detectGaps(
    tenantId: string,
    branchId: string,
    cameraId: string,
    effectiveExpected: TimeInterval[],
    actualRecorded: TimeInterval[],
    minGapThresholdSeconds: number = 0.5
  ): DetailedRecordingGap[] {
    const mergedActual = IntervalMerger.merge(actualRecorded);
    const gaps: DetailedRecordingGap[] = [];
    const minGapMs = minGapThresholdSeconds * 1000;

    for (const exp of effectiveExpected) {
      let pointer = exp.start;

      // Find all actual intervals overlapping with this expected interval
      const overlapping = mergedActual
        .filter((act) => act.end > exp.start && act.start < exp.end)
        .sort((a, b) => a.start - b.start);

      for (const act of overlapping) {
        if (act.start > pointer + minGapMs) {
          const gapStart = Math.max(exp.start, pointer);
          const gapEnd = Math.min(exp.end, act.start);
          const durationSeconds = parseFloat(((gapEnd - gapStart) / 1000).toFixed(3));

          if (durationSeconds >= minGapThresholdSeconds) {
            gaps.push({
              id: randomUUID(),
              tenantId,
              branchId,
              cameraId,
              startTime: new Date(gapStart),
              endTime: new Date(gapEnd),
              durationSeconds,
              detectedAt: new Date(),
              classification: 'UNEXPLAINED',
              status: 'OPEN',
            });
          }
        }
        pointer = Math.max(pointer, act.end);
      }

      if (pointer + minGapMs < exp.end) {
        const gapStart = Math.max(exp.start, pointer);
        const gapEnd = exp.end;
        const durationSeconds = parseFloat(((gapEnd - gapStart) / 1000).toFixed(3));

        if (durationSeconds >= minGapThresholdSeconds) {
          gaps.push({
            id: randomUUID(),
            tenantId,
            branchId,
            cameraId,
            startTime: new Date(gapStart),
            endTime: new Date(gapEnd),
            durationSeconds,
            detectedAt: new Date(),
            classification: 'UNEXPLAINED',
            status: 'OPEN',
          });
        }
      }
    }

    return gaps;
  }
}
