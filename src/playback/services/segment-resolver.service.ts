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
    const ids = new Set<string>();
    const indexed = segments.map(segment => {
      const start = segment.startTime.getTime(), end = segment.endTime.getTime();
      if (segment.cameraId !== cameraId || ids.has(segment.segmentId) || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || !segment.storagePath) {
        throw new Error('invalid_recording_segment');
      }
      ids.add(segment.segmentId);
      const keyframes = segment.keyframes.map(keyframe => {
        if (!Number.isFinite(keyframe.timestampMs) || keyframe.timestampMs < start || keyframe.timestampMs >= end ||
            !Number.isSafeInteger(keyframe.byteOffset) || keyframe.byteOffset < 0 || !Number.isSafeInteger(keyframe.frameNumber) || keyframe.frameNumber < 0) {
          throw new Error('invalid_recording_keyframe');
        }
        return { ...keyframe };
      }).sort((a, b) => a.timestampMs - b.timestampMs);
      return { ...segment, startTime: new Date(start), endTime: new Date(end), keyframes };
    }).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    this.cameraSegments.set(cameraId, indexed);
  }

  segmentCount(cameraId: string): number { return this.cameraSegments.get(cameraId)?.length ?? 0; }

  /**
   * Resolves a target timestamp to containing segment, prior keyframe offset, and prefetch queue.
   */
  resolveSeek(cameraId: string, targetTimestamp: Date): SeekResult {
    const segments = this.cameraSegments.get(cameraId) ?? [];

    const targetMs = targetTimestamp.getTime();
    if (!Number.isFinite(targetMs)) throw new Error('invalid_playback_timestamp');

    const segIndex = segments.findIndex(
      (s) => targetMs >= s.startTime.getTime() && targetMs < s.endTime.getTime()
    );

    if (segIndex === -1) throw new Error(`recording_segment_not_found:${cameraId}:${targetTimestamp.toISOString()}`);

    const currentSegment = segments[segIndex]!;

    // Find closest keyframe <= targetTimestamp
    const priorKeyframes = currentSegment.keyframes.filter((k) => k.timestampMs <= targetMs);
    const closestKeyframe =
      priorKeyframes[priorKeyframes.length - 1];
    if (!closestKeyframe) throw new Error('recording_keyframe_unavailable');

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
