import type { RecordingGapItem, RecordingSegmentResult } from "./recording-index.types.js";

export interface MergedInterval {
  startMs: number;
  endMs: number;
}

export class RecordingGapService {
  /**
   * Merges overlapping and abutting recording segment intervals to avoid duplicate coverage.
   */
  mergeIntervals(
    segments: Array<{ startTime: Date; endTime: Date }>,
  ): MergedInterval[] {
    if (segments.length === 0) return [];

    // Sort by start time ascending
    const sorted = [...segments].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const first = sorted[0];
    if (!first) return [];

    const merged: MergedInterval[] = [];
    let current: MergedInterval = {
      startMs: first.startTime.getTime(),
      endMs: first.endTime.getTime(),
    };

    for (let i = 1; i < sorted.length; i++) {
      const seg = sorted[i];
      if (!seg) continue;
      const segStart = seg.startTime.getTime();
      const segEnd = seg.endTime.getTime();

      // If overlapping or abutting within 500ms jitter tolerance
      if (segStart <= current.endMs + 500) {
        current.endMs = Math.max(current.endMs, segEnd);
      } else {
        merged.push(current);
        current = { startMs: segStart, endMs: segEnd };
      }
    }
    merged.push(current);
    return merged;
  }

  /**
   * Calculates recording gaps within [from, to] based on merged segment intervals.
   */
  calculateGaps(
    from: Date,
    to: Date,
    segments: Array<{ startTime: Date; endTime: Date }>,
    options: { minGapDurationMs?: number } = {},
  ): {
    gaps: RecordingGapItem[];
    coverageMs: number;
    requestedMs: number;
    coveragePercent: number;
  } {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const requestedMs = Math.max(0, toMs - fromMs);

    if (requestedMs === 0) {
      return { gaps: [], coverageMs: 0, requestedMs: 0, coveragePercent: 100 };
    }

    const minGapMs = options.minGapDurationMs ?? 500; // Ignore sub-500ms container transition seams
    const merged = this.mergeIntervals(segments);
    const gaps: RecordingGapItem[] = [];

    let cursor = fromMs;
    let totalCoveredMs = 0;

    for (const interval of merged) {
      const clampedStart = Math.max(interval.startMs, fromMs);
      const clampedEnd = Math.min(interval.endMs, toMs);

      if (clampedStart > cursor) {
        const gapDurationMs = clampedStart - cursor;
        if (gapDurationMs >= minGapMs) {
          gaps.push({
            from: new Date(cursor),
            to: new Date(clampedStart),
            durationMs: gapDurationMs,
            reason: "RECORDING_GAP",
          });
        }
      }

      if (clampedEnd > clampedStart) {
        totalCoveredMs += clampedEnd - Math.max(clampedStart, cursor);
      }

      cursor = Math.max(cursor, clampedEnd);
    }

    if (cursor < toMs) {
      const trailingGapMs = toMs - cursor;
      if (trailingGapMs >= minGapMs) {
        gaps.push({
          from: new Date(cursor),
          to: new Date(toMs),
          durationMs: trailingGapMs,
          reason: "TRAILING_GAP",
        });
      }
    }

    const coveragePercent = requestedMs > 0
      ? Math.min(100, Math.max(0, Number(((totalCoveredMs / requestedMs) * 100).toFixed(4))))
      : 100;

    return {
      gaps,
      coverageMs: totalCoveredMs,
      requestedMs,
      coveragePercent,
    };
  }
}

export const recordingGapService = new RecordingGapService();
