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

  constructor() {
    this.seedDefaultSegments();
  }

  private seedDefaultSegments() {
    const baseTime = new Date('2026-08-17T00:00:00.000Z').getTime();

    // Seed 2,880 consecutive 30-second segments for CAM-14 (full 24h continuous recording)
    const segments: ResolvedSegment[] = [];
    for (let i = 0; i < 100; i++) {
      const segStart = baseTime + i * 30000;
      const segEnd = segStart + 30000;

      const keyframes: KeyframePoint[] = [
        { timestampMs: segStart, byteOffset: 0, frameNumber: 0 },
        { timestampMs: segStart + 2000, byteOffset: 380000, frameNumber: 50 },
        { timestampMs: segStart + 4000, byteOffset: 760000, frameNumber: 100 },
        { timestampMs: segStart + 6000, byteOffset: 1140000, frameNumber: 150 },
      ];

      segments.push({
        segmentId: `seg-cam14-${i + 1}`,
        cameraId: 'CAM-14',
        startTime: new Date(segStart),
        endTime: new Date(segEnd),
        durationMs: 30000,
        storagePath: `/mnt/surveillance/BR-118/CAM-14/seg-${i + 1}.mp4`,
        storageNode: 'node-01',
        codec: 'h265',
        keyframes,
        discontinuityBefore: false,
      });
    }

    this.cameraSegments.set('CAM-14', segments);
    this.cameraSegments.set('VAULT-01', segments);
    this.cameraSegments.set('CORRIDOR-04', segments);
    this.cameraSegments.set('ENTRY-01', segments);
  }

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

    if (segIndex === -1) {
      // If past latest, return latest segment
      const fallback = segments[segments.length - 1] || {
        segmentId: 'seg-fallback',
        cameraId,
        startTime: targetTimestamp,
        endTime: new Date(targetMs + 30000),
        durationMs: 30000,
        storagePath: `/mnt/surveillance/${cameraId}/seg-fallback.mp4`,
        storageNode: 'node-01',
        codec: 'h265',
        keyframes: [{ timestampMs: targetMs, byteOffset: 0, frameNumber: 0 }],
        discontinuityBefore: false,
      };

      return {
        segment: fallback,
        closestKeyframe: fallback.keyframes[0]!,
        targetTimestampMs: targetMs,
        offsetFromKeyframeMs: 0,
        prefetchSegments: [],
      };
    }

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
