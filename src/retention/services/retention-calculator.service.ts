/**
 * Retention Calculator Service
 * 
 * Computes exact actual retention days, recording window span,
 * recording age, and gap analysis across archive intervals.
 */

import type {
  RecordingWindow,
  RecordingCoverage,
  RecordingGap,
} from "../domain/retention.types.js";

export class RetentionCalculatorService {
  /**
   * Calculates the verified recording window
   */
  calculateRecordingWindow(
    oldestRecordingAt: Date,
    newestRecordingAt: Date,
    now: Date = new Date(),
    coveragePercent?: number
  ): RecordingWindow {
    const archiveSpanMs = Math.max(0, newestRecordingAt.getTime() - oldestRecordingAt.getTime());
    const archiveSpanDays = Number((archiveSpanMs / 86_400_000).toFixed(2));
    const latestRecordingAgeMinutes = Math.max(0, Math.round((now.getTime() - newestRecordingAt.getTime()) / 60_000));

    return {
      oldestRecordingAt,
      newestRecordingAt,
      archiveSpanDays,
      latestRecordingAgeMinutes,
      coveragePercent,
    };
  }

  /**
   * Analyzes continuity across a sequence of recording segments
   */
  calculateCoverage(
    segments: Array<{ startTime: Date; endTime: Date }>,
    expectedFrom: Date,
    expectedTo: Date,
    maxAllowedGapMinutes = 15
  ): RecordingCoverage {
    const expectedMinutes = Math.max(1, Math.round((expectedTo.getTime() - expectedFrom.getTime()) / 60_000));
    if (segments.length === 0) {
      return {
        expectedMinutes,
        recordedMinutes: 0,
        missingMinutes: expectedMinutes,
        coveragePercent: 0,
        largestGapMinutes: expectedMinutes,
        gaps: [
          {
            from: expectedFrom,
            to: expectedTo,
            durationMinutes: expectedMinutes,
            cause: "RECORDER_OFFLINE",
          },
        ],
      };
    }

    // Sort segments chronologically
    const sorted = [...segments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    let recordedMs = 0;
    const gaps: RecordingGap[] = [];
    let largestGapMinutes = 0;

    let cursor = expectedFrom.getTime();

    for (const seg of sorted) {
      const segStart = seg.startTime.getTime();
      const segEnd = seg.endTime.getTime();

      // Check gap before this segment
      if (segStart > cursor) {
        const gapMs = segStart - cursor;
        const gapMins = Math.round(gapMs / 60_000);
        if (gapMins >= maxAllowedGapMinutes) {
          gaps.push({
            from: new Date(cursor),
            to: new Date(segStart),
            durationMinutes: gapMins,
            cause: "UNKNOWN",
          });
          if (gapMins > largestGapMinutes) {
            largestGapMinutes = gapMins;
          }
        }
      }

      const effectiveStart = Math.max(segStart, cursor);
      const effectiveEnd = Math.min(segEnd, expectedTo.getTime());
      if (effectiveEnd > effectiveStart) {
        recordedMs += effectiveEnd - effectiveStart;
        cursor = effectiveEnd;
      }
    }

    // Check gap at the end
    if (cursor < expectedTo.getTime()) {
      const gapMs = expectedTo.getTime() - cursor;
      const gapMins = Math.round(gapMs / 60_000);
      if (gapMins >= maxAllowedGapMinutes) {
        gaps.push({
          from: new Date(cursor),
          to: expectedTo,
          durationMinutes: gapMins,
          cause: "RECORDER_OFFLINE",
        });
        if (gapMins > largestGapMinutes) {
          largestGapMinutes = gapMins;
        }
      }
    }

    const recordedMinutes = Math.min(expectedMinutes, Math.round(recordedMs / 60_000));
    const missingMinutes = Math.max(0, expectedMinutes - recordedMinutes);
    const coveragePercent = Number(((recordedMinutes / expectedMinutes) * 100).toFixed(2));

    return {
      expectedMinutes,
      recordedMinutes,
      missingMinutes,
      coveragePercent,
      largestGapMinutes,
      gaps,
    };
  }
}

export const retentionCalculatorService = new RetentionCalculatorService();
