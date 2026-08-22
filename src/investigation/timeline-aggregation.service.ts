import type { DbInvestigationEvent } from "../domain/models.js";
import type { CameraRecordingResult } from "../recording-index/recording-index.types.js";
import type { TimelineBucket } from "./investigation.types.js";

export class TimelineAggregationService {
  /**
   * Aggregates events and video recording coverage into discrete resolution buckets.
   */
  aggregate(
    from: Date,
    to: Date,
    resolutionSeconds: number,
    events: DbInvestigationEvent[],
    videoCoverage: CameraRecordingResult[] = [],
  ): TimelineBucket[] {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const bucketDurationMs = Math.max(1, resolutionSeconds) * 1_000;

    if (toMs <= fromMs) return [];

    const buckets: TimelineBucket[] = [];
    const bucketCount = Math.min(2_000, Math.ceil((toMs - fromMs) / bucketDurationMs));

    for (let i = 0; i < bucketCount; i++) {
      const bStartMs = fromMs + i * bucketDurationMs;
      const bEndMs = Math.min(toMs, bStartMs + bucketDurationMs);

      buckets.push({
        start: new Date(bStartMs).toISOString(),
        end: new Date(bEndMs).toISOString(),
        recorded: false,
        motionCount: 0,
        personCount: 0,
        vehicleCount: 0,
        doorCount: 0,
        alertCount: 0,
        incidentCount: 0,
        bookmarkCount: 0,
        totalEvents: 0,
      });
    }

    // 1. Mark recorded state per bucket using video segment coverage
    for (const cam of videoCoverage) {
      for (const seg of cam.segments) {
        const segStartMs = seg.startTime.getTime();
        const segEndMs = seg.endTime.getTime();

        const firstBucketIdx = Math.max(0, Math.floor((segStartMs - fromMs) / bucketDurationMs));
        const lastBucketIdx = Math.min(buckets.length - 1, Math.floor((segEndMs - fromMs) / bucketDurationMs));

        for (let idx = firstBucketIdx; idx <= lastBucketIdx; idx++) {
          const b = buckets[idx];
          if (b) {
            b.recorded = true;
          }
        }
      }
    }

    // 2. Count events into corresponding buckets
    for (const ev of events) {
      const evStartMs = new Date(ev.startTime).getTime();
      const evEndMs = ev.endTime ? new Date(ev.endTime).getTime() : evStartMs;

      const firstBucketIdx = Math.max(0, Math.floor((evStartMs - fromMs) / bucketDurationMs));
      const lastBucketIdx = Math.min(buckets.length - 1, Math.floor((evEndMs - fromMs) / bucketDurationMs));

      for (let idx = firstBucketIdx; idx <= lastBucketIdx; idx++) {
        const bucket = buckets[idx];
        if (!bucket) continue;

        bucket.totalEvents++;
        const type = ev.eventType.toLowerCase();

        if (type.includes("motion")) {
          bucket.motionCount++;
        } else if (type.includes("person") || ev.objectType === "PERSON") {
          bucket.personCount++;
        } else if (type.includes("vehicle") || ev.objectType === "VEHICLE") {
          bucket.vehicleCount++;
        } else if (type.includes("door") || type.includes("access")) {
          bucket.doorCount++;
        } else if (type.includes("alert")) {
          bucket.alertCount++;
        } else if (type.includes("incident") || ev.incidentId) {
          bucket.incidentCount++;
        } else if (type.includes("bookmark")) {
          bucket.bookmarkCount++;
        }
      }
    }

    return buckets;
  }
}

export const timelineAggregationService = new TimelineAggregationService();
