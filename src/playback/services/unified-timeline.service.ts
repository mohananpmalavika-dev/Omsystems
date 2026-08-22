/**
 * Unified Multi-Track Timeline Service
 * Aggregates Video, Motion, AI, Access, Alert, and Bookmark events with multi-resolution bucketing.
 */

import { TimelineItem, TimelineBucket, PlaybackBookmark } from '../domain/playback.types.js';

export interface TimelineQueryInput {
  cameraId: string;
  from: string; // ISO timestamp
  to: string; // ISO timestamp
  tracks?: string[]; // Optional track filters
}

export interface UnifiedTimelineResponse {
  cameraId: string;
  range: { start: string; end: string };
  recording: Array<{ start: string; end: string }>;
  motion: Array<{ timestamp: string; durationMs: number }>;
  aiEvents: Array<{ timestamp: string; type: 'PERSON' | 'VEHICLE'; confidence: number; label: string }>;
  accessEvents: Array<{ timestamp: string; badgeId: string; doorName: string; accessResult: 'GRANTED' | 'DENIED' }>;
  alerts: Array<{ timestamp: string; severity: string; title: string; incidentId?: string }>;
  bookmarks: PlaybackBookmark[];
  buckets?: TimelineBucket[];
}

export class UnifiedTimelineService {
  private events: TimelineItem[] = [];
  private bookmarks: PlaybackBookmark[] = [];

  /** Adds an event received from an authoritative integration. */
  ingest(event: TimelineItem): void {
    this.events.push(event);
  }

  addBookmark(bookmark: PlaybackBookmark): void {
    this.bookmarks.push(bookmark);
  }

  getBookmarks(cameraId: string): PlaybackBookmark[] {
    return this.bookmarks.filter((b) => b.cameraId === cameraId);
  }

  /**
   * Builds the comprehensive unified multi-track timeline response.
   */
  getTimeline(query: TimelineQueryInput): UnifiedTimelineResponse {
    const fromMs = new Date(query.from).getTime();
    const toMs = new Date(query.to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      throw new Error('invalid_timeline_range');
    }
    const durationHours = (toMs - fromMs) / 3600_000;

    const filteredEvents = this.events.filter((e) => {
      const eTime = new Date(e.startTime).getTime();
      return e.cameraId === query.cameraId && eTime >= fromMs && eTime <= toMs;
    });

    const recording = filteredEvents
      .filter((e) => e.track === 'RECORDING' && typeof e.endTime === 'string')
      .map((e) => ({ start: e.startTime, end: e.endTime! }))
      .filter(({ start, end }) => new Date(end).getTime() > new Date(start).getTime());

    const motion = filteredEvents
      .filter((e) => e.track === 'MOTION' && typeof e.metadata?.durationMs === 'number')
      .map((e) => ({
        timestamp: e.startTime,
        durationMs: e.metadata!.durationMs as number,
      }));

    const aiEvents = filteredEvents
      .filter((e) =>
        e.track === 'AI' &&
        (e.type === 'PERSON' || e.type === 'VEHICLE') &&
        typeof e.metadata?.confidence === 'number' &&
        typeof e.label === 'string',
      )
      .map((e) => ({
        timestamp: e.startTime,
        type: e.type as 'PERSON' | 'VEHICLE',
        confidence: e.metadata!.confidence as number,
        label: e.label!,
      }));

    const accessEvents = filteredEvents
      .filter((e) =>
        e.track === 'ACCESS' &&
        typeof e.metadata?.badgeId === 'string' &&
        typeof e.metadata?.doorName === 'string' &&
        (e.metadata?.accessResult === 'GRANTED' || e.metadata?.accessResult === 'DENIED'),
      )
      .map((e) => ({
        timestamp: e.startTime,
        badgeId: e.metadata!.badgeId as string,
        doorName: e.metadata!.doorName as string,
        accessResult: e.metadata!.accessResult as 'GRANTED' | 'DENIED',
      }));

    const alerts = filteredEvents
      .filter((e) => e.track === 'ALERT' && typeof e.severity === 'string' && typeof e.label === 'string')
      .map((e) => ({
        timestamp: e.startTime,
        severity: e.severity!,
        title: e.label!,
        incidentId: e.metadata?.incidentId as string,
      }));

    const bookmarks = this.getBookmarks(query.cameraId);

    // Multi-resolution bucket aggregation if zoomed out (> 1 hour)
    let buckets: TimelineBucket[] | undefined;
    if (durationHours >= 1) {
      const bucketCount = durationHours >= 12 ? 24 : 12;
      const bucketSpanMs = (toMs - fromMs) / bucketCount;
      buckets = [];

      for (let i = 0; i < bucketCount; i++) {
        const bStart = fromMs + i * bucketSpanMs;
        const bEnd = bStart + bucketSpanMs;

        const inBucket = filteredEvents.filter((e) => {
          const t = new Date(e.startTime).getTime();
          return t >= bStart && t < bEnd;
        });

        buckets.push({
          bucketStart: new Date(bStart).toISOString(),
          bucketEnd: new Date(bEnd).toISOString(),
          recordingSeconds: Math.round(recording.reduce((total, segment) => {
            const start = Math.max(bStart, new Date(segment.start).getTime());
            const end = Math.min(bEnd, new Date(segment.end).getTime());
            return total + Math.max(0, end - start);
          }, 0) / 1000),
          motionCount: inBucket.filter((e) => e.track === 'MOTION').length,
          personCount: inBucket.filter((e) => e.track === 'AI' && e.type === 'PERSON').length,
          vehicleCount: inBucket.filter((e) => e.track === 'AI' && e.type === 'VEHICLE').length,
          accessCount: inBucket.filter((e) => e.track === 'ACCESS').length,
          alertCount: inBucket.filter((e) => e.track === 'ALERT').length,
          bookmarkCount: bookmarks.filter((b) => {
            const bt = new Date(b.timestamp).getTime();
            return bt >= bStart && bt < bEnd;
          }).length,
        });
      }
    }

    return {
      cameraId: query.cameraId,
      range: { start: query.from, end: query.to },
      recording,
      motion,
      aiEvents,
      accessEvents,
      alerts,
      bookmarks,
      buckets,
    };
  }

  /**
   * Jump to Next / Previous event along the timeline.
   */
  findAdjacentEvent(
    cameraId: string,
    currentTimestamp: string,
    direction: 'NEXT' | 'PREVIOUS',
    types?: string[]
  ): TimelineItem | undefined {
    const currentMs = new Date(currentTimestamp).getTime();

    let candidates = this.events.filter((e) => {
      if (types && types.length > 0 && !types.includes(e.type) && !types.includes(e.track)) {
        return false;
      }
      const eTime = new Date(e.startTime).getTime();
      return direction === 'NEXT' ? eTime > currentMs : eTime < currentMs;
    });

    if (direction === 'NEXT') {
      candidates.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    } else {
      candidates.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }

    return candidates[0];
  }
}
