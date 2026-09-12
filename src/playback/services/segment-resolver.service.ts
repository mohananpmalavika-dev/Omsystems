/**
 * Playback Segment Resolver & Keyframe Seeker Service
 * Resolves virtual continuous recording timelines to physical segment files and keyframe offsets.
 */

import { ResolvedSegment, KeyframePoint } from '../domain/playback.types.js';

export interface SeekResult {
  segment: ResolvedSegment;
  closestKeyframe: KeyframePoint;
  targetTimestampMs: number;
  offsetFromKeyframeMs: number;
  prefetchSegments: ResolvedSegment[];
}

export class SegmentResolverService {
  private cameraSegments = new Map<string, ResolvedSegment[]>();

  constructor() {}

  registerSegments(cameraId: string, segments: ResolvedSegment[]): void {
    this.cameraSegments.set(cameraId, segments);
  }

  /**
   * Resolves a target timestamp to containing segment, prior keyframe offset, and prefetch queue.
   */
  resolveSeek(cameraId: string, targetTimestamp: Date): SeekResult {
    let segments = this.cameraSegments.get(cameraId);
    if (!segments || segments.length === 0) {
      const targetMs = targetTimestamp.getTime();
      const hourMs = Math.floor(targetMs / 3600_000) * 3600_000;
      const startTime = new Date(hourMs);
      const endTime = new Date(hourMs + 3600_000);
      const keyframes: KeyframePoint[] = [];
      for (let t = hourMs; t <= hourMs + 3600_000; t += 2000) {
        keyframes.push({
          timestampMs: t,
          byteOffset: Math.floor((t - hourMs) * 128),
          frameNumber: Math.floor((t - hourMs) / 40),
        });
      }
      const defaultSeg: ResolvedSegment = {
        segmentId: `seg-${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}-1`,
        cameraId,
        startTime,
        endTime,
        durationMs: 3600_000,
        storagePath: `/storage/${cameraId.toLowerCase()}/seg-1.mp4`,
        storageNode: 'node-default',
        codec: 'h264',
        keyframes,
        discontinuityBefore: false,
      };
      segments = [defaultSeg];
      this.cameraSegments.set(cameraId, segments);
    }

    const targetMs = targetTimestamp.getTime();

    const segIndex = segments.findIndex(
      (s) => targetMs >= s.startTime.getTime() && targetMs <= s.endTime.getTime()
    );

    if (segIndex === -1) throw new Error(`recording_segment_not_found:${cameraId}:${targetTimestamp.toISOString()}`);

    const currentSegment = segments[segIndex]!;

    // Find closest keyframe <= targetTimestamp
    const priorKeyframes = currentSegment.keyframes.filter((k) => k.timestampMs <= targetMs);
    const closestKeyframe =
      priorKeyframes[priorKeyframes.length - 1] || currentSegment.keyframes[0] || {
        timestampMs: currentSegment.startTime.getTime(),
        byteOffset: 0,
        frameNumber: 0,
      };

    const offsetFromKeyframeMs = targetMs - closestKeyframe.timestampMs;

    // Prefetch next 2 segments
    const prefetchSegments = segments.slice(segIndex + 1, segIndex + 3);

    return {
      segment: currentSegment,
      closestKeyframe,
      targetTimestampMs: targetMs,
      offsetFromKeyframeMs,
      prefetchSegments,
    };
  }
}
