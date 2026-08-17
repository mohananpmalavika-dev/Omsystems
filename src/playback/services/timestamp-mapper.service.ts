/**
 * Timestamp Mapper Service
 * Translates Canonical Server UTC to exact Media Time, Segment, and 90kHz PTS values.
 */

import { MediaPosition } from '../clock/clock-synchronization.types.js';
import { ClockSynchronizationService } from '../clock/clock-synchronization.service.js';
import { SegmentResolverService } from './segment-resolver.service.js';

export class TimestampMapperService {
  private readonly TIME_BASE_HZ = 90_000n; // Standard 90kHz MPEG/RTP timebase

  constructor(
    private readonly clockSync: ClockSynchronizationService,
    private readonly segmentResolver: SegmentResolverService
  ) {}

  /**
   * Translates Canonical Server UTC timestamp into physical media segment position and PTS.
   */
  canonicalToMedia(cameraId: string, canonicalUtcMs: number): MediaPosition {
    const targetDate = new Date(canonicalUtcMs);
    const seekRes = this.segmentResolver.resolveSeek(cameraId, targetDate);
    const clockEst = this.clockSync.getEstimatedOffsetAtUtc(cameraId, canonicalUtcMs);

    const segmentCanonicalStartMs = seekRes.segment.startTime.getTime();
    const mediaOffsetMs = Math.max(0, canonicalUtcMs - segmentCanonicalStartMs);
    const mediaOffsetSec = mediaOffsetMs / 1000;

    // First PTS from segment header or standard baseline 180,000 (2.0s)
    const firstPts = 180_000n;
    const targetPts = firstPts + BigInt(Math.round(mediaOffsetSec * Number(this.TIME_BASE_HZ)));

    const nearestKeyframeSec = (seekRes.closestKeyframe.timestampMs - segmentCanonicalStartMs) / 1000;
    const nearestKeyframePts = firstPts + BigInt(Math.round(nearestKeyframeSec * Number(this.TIME_BASE_HZ)));

    const synchronizationErrorMs = Math.abs(canonicalUtcMs - (segmentCanonicalStartMs + nearestKeyframeSec * 1000));

    return {
      cameraId,
      segmentId: seekRes.segment.segmentId,
      canonicalUtcMs,
      mediaOffsetMs,
      targetPts,
      nearestKeyframePts,
      nearestKeyframeOffsetBytes: seekRes.closestKeyframe.byteOffset,
      synchronizationErrorMs,
      clockConfidence: clockEst.confidence,
    };
  }

  /**
   * Translates Media PTS back into Canonical Server UTC.
   */
  mediaToCanonical(
    cameraId: string,
    segmentCanonicalStartMs: number,
    pts: bigint,
    firstPts: bigint = 180_000n
  ): number {
    const ptsDelta = pts - firstPts;
    const relativeSec = Number(ptsDelta) / Number(this.TIME_BASE_HZ);
    return Math.round(segmentCanonicalStartMs + relativeSec * 1000);
  }
}
