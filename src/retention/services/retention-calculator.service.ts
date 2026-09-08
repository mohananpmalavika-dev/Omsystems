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
    const fromMs = expectedFrom.getTime();
    const toMs = expectedTo.getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      throw new Error("retention_coverage_window_invalid");
    }
    const expectedMinutes = Math.max(1, Math.round((toMs - fromMs) / 60_000));
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

    const intervals = segments
      .map((segment) => ({ start: segment.startTime.getTime(), end: segment.endTime.getTime() }))
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
      .map((segment) => ({ start: Math.max(fromMs, segment.start), end: Math.min(toMs, segment.end) }))
      .filter((segment) => segment.end > segment.start)
      .sort((left, right) => left.start - right.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else merged.push({ ...interval });
    }

    let recordedMs = 0;
    const gaps: RecordingGap[] = [];
    let largestGapMinutes = 0;

    let cursor = fromMs;

    for (const segment of merged) {
      const segStart = segment.start;
      const segEnd = segment.end;

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
      const effectiveEnd = segEnd;
      if (effectiveEnd > effectiveStart) {
        recordedMs += effectiveEnd - effectiveStart;
        cursor = effectiveEnd;
      }
    }

    // Check gap at the end
    if (cursor < toMs) {
      const gapMs = toMs - cursor;
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
