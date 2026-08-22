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
    const segments = this.cameraSegments.get(cameraId) || [];
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
