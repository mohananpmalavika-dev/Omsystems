/**
 * Recording Gap Detector & Timeline Merge Engine
 * 
 * Merges fragmented/overlapping archive segments, detects missing duration gaps,
 * and calculates exact SLA continuity percentages.
 */

import type { RecordingSegment, RecordingGap } from "../domain/recording-continuity.types.js";

export class RecordingGapDetector {
  /**
   * Merges contiguous and overlapping segments to eliminate NVR file-chunking artifacts.
   */
  static mergeSegments(segments: RecordingSegment[], allowedOverlapFudgeMs = 1000): RecordingSegment[] {
    if (segments.length === 0) return [];

    // Sort chronologically by start time
    const sorted = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: RecordingSegment[] = [];

    let current = { ...sorted[0]! };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]!;

      // If next starts before or within fudge window of current end, merge
      if (next.start.getTime() <= current.end.getTime() + allowedOverlapFudgeMs) {
        if (next.end.getTime() > current.end.getTime()) {
          current.end = next.end;
        }
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Detects gaps between merged segments that exceed allowed tolerance.
   */
  static detectGaps(
    segments: RecordingSegment[],
    options: {
      windowStart: Date;
      windowEnd: Date;
      allowedGapSeconds?: number | undefined;
      context?: { organizationId?: string; branchId?: string; recorderId?: string; cameraId?: string } | undefined;
    }
  ): RecordingGap[] {
    const allowedGapSec = options.allowedGapSeconds ?? 5;
    const merged = this.mergeSegments(segments);
    const gaps: RecordingGap[] = [];
    const now = new Date();

    if (merged.length === 0) {
      // Entire window is missing
      const durationSeconds = Math.max(0, (options.windowEnd.getTime() - options.windowStart.getTime()) / 1000);
      if (durationSeconds > allowedGapSec) {
        gaps.push({
          id: `gap-${Date.now()}-full`,
          organizationId: options.context?.organizationId || "bank-corp",
          branchId: options.context?.branchId || "branch-01",
          recorderId: options.context?.recorderId || "rec-01",
          cameraId: options.context?.cameraId || "cam-01",
          start: options.windowStart,
          end: options.windowEnd,
          durationSeconds,
          cause: "UNKNOWN",
          causeConfidence: "LOW",
          detectedAt: now,
          status: "CONFIRMED",
        });
      }
      return gaps;
    }

    // 1. Check gap before first segment
    const firstStart = merged[0]!.start;
    const leadingGapSec = (firstStart.getTime() - options.windowStart.getTime()) / 1000;
    if (leadingGapSec > allowedGapSec) {
      gaps.push({
        id: `gap-lead-${firstStart.getTime()}`,
        organizationId: options.context?.organizationId || "bank-corp",
        branchId: options.context?.branchId || "branch-01",
        recorderId: options.context?.recorderId || "rec-01",
        cameraId: options.context?.cameraId || "cam-01",
        start: options.windowStart,
        end: firstStart,
        durationSeconds: leadingGapSec,
        cause: "UNKNOWN",
        causeConfidence: "LOW",
        detectedAt: now,
        status: "CONFIRMED",
      });
    }

    // 2. Check intermediate gaps
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1]!;
      const curr = merged[i]!;
      const gapSec = (curr.start.getTime() - prev.end.getTime()) / 1000;

      if (gapSec > allowedGapSec) {
        gaps.push({
          id: `gap-${prev.end.getTime()}-${curr.start.getTime()}`,
          organizationId: options.context?.organizationId || "bank-corp",
          branchId: options.context?.branchId || "branch-01",
          recorderId: options.context?.recorderId || "rec-01",
          cameraId: options.context?.cameraId || "cam-01",
          start: prev.end,
          end: curr.start,
          durationSeconds: gapSec,
          cause: "UNKNOWN",
          causeConfidence: "LOW",
          detectedAt: now,
          status: "CONFIRMED",
        });
      }
    }

    // 3. Check trailing gap after last segment
    const lastEnd = merged[merged.length - 1]!.end;
    const trailingGapSec = (options.windowEnd.getTime() - lastEnd.getTime()) / 1000;
    if (trailingGapSec > allowedGapSec) {
      gaps.push({
        id: `gap-trail-${lastEnd.getTime()}`,
        organizationId: options.context?.organizationId || "bank-corp",
        branchId: options.context?.branchId || "branch-01",
        recorderId: options.context?.recorderId || "rec-01",
        cameraId: options.context?.cameraId || "cam-01",
        start: lastEnd,
        end: options.windowEnd,
        durationSeconds: trailingGapSec,
        cause: "UNKNOWN",
        causeConfidence: "LOW",
        detectedAt: now,
        status: "CONFIRMED",
      });
    }

    return gaps;
  }

  /**
   * Calculates recording continuity percentage given expected duration and detected gaps.
   */
  static calculateContinuityPct(expectedSeconds: number, gaps: RecordingGap[]): number {
    if (expectedSeconds <= 0) return 0;
    const missingSeconds = gaps.reduce((sum, g) => sum + g.durationSeconds, 0);
    const recordedSeconds = Math.max(0, expectedSeconds - missingSeconds);
    const pct = (recordedSeconds / expectedSeconds) * 100;
    return Number(Math.max(0, Math.min(100, pct)).toFixed(4));
  }
}
