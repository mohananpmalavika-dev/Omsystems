/**
 * High-Precision Daily Recording Coverage Calculator & Health Evaluator
 */

import { TimeInterval, IntervalMerger } from './interval-merger.js';
import { GapDetector, DetailedRecordingGap } from './gap-detector.js';

export interface RecordingCoverageDaily {
  tenantId: string;
  branchId: string;
  cameraId: string;
  coverageDate: string; // "YYYY-MM-DD"

  expectedCalendarSeconds: number; // e.g. 86400
  excludedSeconds: number; // e.g. 1800 for maintenance
  expectedSeconds: number; // e.g. 84600

  recordedSeconds: number;
  missingSeconds: number;

  coveragePercent: number; // high-precision e.g. 99.99769

  gapCount: number;
  largestGapSeconds: number;

  firstRecordingAt?: Date;
  lastRecordingAt?: Date;

  verifiedSegmentCount: number;
  corruptSegmentCount: number;

  gaps: DetailedRecordingGap[];
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  calculatedAt: Date;
}

export class CoverageCalculator {
  /**
   * Calculates high-precision daily recording coverage.
   */
  static calculateDailyCoverage(params: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    coverageDate: string;
    calendarRange: TimeInterval; // Typically 00:00 to 23:59:59 (86,400s)
    exclusionRanges: TimeInterval[];
    recordedSegments: Array<{ start: Date; end: Date; isCorrupt?: boolean }>;
  }): RecordingCoverageDaily {
    const {
      tenantId,
      branchId,
      cameraId,
      coverageDate,
      calendarRange,
      exclusionRanges,
      recordedSegments,
    } = params;

    const expectedCalendarSeconds = IntervalMerger.totalSeconds([calendarRange]);
    const mergedExclusions = IntervalMerger.merge(exclusionRanges);
    const excludedSeconds = IntervalMerger.totalSeconds(mergedExclusions);

    // Effective expected intervals = Calendar range minus Exclusions
    const effectiveExpectedIntervals = IntervalMerger.subtract([calendarRange], mergedExclusions);
    const expectedSeconds = IntervalMerger.totalSeconds(effectiveExpectedIntervals);

    const validSegmentIntervals: TimeInterval[] = recordedSegments
      .filter((s) => !s.isCorrupt)
      .map((s) => ({ start: s.start.getTime(), end: s.end.getTime() }));

    const corruptSegmentCount = recordedSegments.filter((s) => s.isCorrupt).length;
    const verifiedSegmentCount = recordedSegments.length - corruptSegmentCount;

    const mergedRecorded = IntervalMerger.merge(validSegmentIntervals);
    const recordedSeconds = Math.min(expectedSeconds, IntervalMerger.totalSeconds(mergedRecorded));
    const missingSeconds = parseFloat(Math.max(0, expectedSeconds - recordedSeconds).toFixed(3));

    // High-precision coverage percentage
    const coveragePercent =
      expectedSeconds > 0
        ? parseFloat(((recordedSeconds / expectedSeconds) * 100).toFixed(5))
        : 100.0;

    // Detect all gaps
    const gaps = GapDetector.detectGaps(
      tenantId,
      branchId,
      cameraId,
      effectiveExpectedIntervals,
      mergedRecorded
    );

    const gapCount = gaps.length;
    const largestGapSeconds = gaps.reduce((max, g) => Math.max(max, g.durationSeconds), 0);

    let firstRecordingAt: Date | undefined;
    let lastRecordingAt: Date | undefined;
    if (recordedSegments.length > 0) {
      const sorted = [...recordedSegments].sort((a, b) => a.start.getTime() - b.start.getTime());
      firstRecordingAt = sorted[0]?.start;
      lastRecordingAt = sorted[sorted.length - 1]?.end;
    }

    // Health Status Evaluation
    let healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (coveragePercent < 99.9 || largestGapSeconds > 30 || corruptSegmentCount > 0) {
      healthStatus = 'CRITICAL';
    } else if (coveragePercent < 99.99 || largestGapSeconds > 5) {
      healthStatus = 'WARNING';
    } else {
      healthStatus = 'HEALTHY';
    }

    return {
      tenantId,
      branchId,
      cameraId,
      coverageDate,
      expectedCalendarSeconds,
      excludedSeconds,
      expectedSeconds,
      recordedSeconds,
      missingSeconds,
      coveragePercent,
      gapCount,
      largestGapSeconds,
      firstRecordingAt,
      lastRecordingAt,
      verifiedSegmentCount,
      corruptSegmentCount,
      gaps,
      healthStatus,
      calculatedAt: new Date(),
    };
  }
}
