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

  constructor() {
  }

  private seedDefaultTimeline() {
    const baseTime = new Date('2026-08-17T00:00:00.000Z').getTime();

    // 1. Motion Bursts
    this.events.push(
      {
        id: 'mot-01',
        track: 'MOTION',
        startTime: new Date(baseTime + 8 * 3600_000 + 31 * 60_000 + 22000).toISOString(), // 08:31:22
        type: 'MOTION',
        metadata: { durationMs: 3400 },
      },
      {
        id: 'mot-02',
        track: 'MOTION',
        startTime: new Date(baseTime + 14 * 3600_000 + 23 * 60_000 + 42000).toISOString(), // 14:23:42
        type: 'MOTION',
        metadata: { durationMs: 7800 },
      }
    );

    // 2. AI Detections (Person P, Vehicle V)
    this.events.push(
      {
        id: 'ai-01',
        track: 'AI',
        startTime: new Date(baseTime + 8 * 3600_000 + 34 * 60_000 + 11000).toISOString(), // 08:34:11
        type: 'PERSON',
        label: 'Person in Corridor',
        metadata: { confidence: 0.94 },
      },
      {
        id: 'ai-02',
        track: 'AI',
        startTime: new Date(baseTime + 10 * 3600_000 + 42 * 60_000 + 17000).toISOString(), // 10:42:17
        type: 'VEHICLE',
        label: 'Vehicle at Gate',
        metadata: { confidence: 0.98 },
      },
      {
        id: 'ai-03',
        track: 'AI',
        startTime: new Date(baseTime + 14 * 3600_000 + 23 * 60_000 + 43000).toISOString(), // 14:23:43
        type: 'PERSON',
        label: 'Intruder at Vault Door',
        metadata: { confidence: 0.99 },
      }
    );

    // 3. Access Control (Badge B, Door D)
    this.events.push({
      id: 'acc-01',
      track: 'ACCESS',
      startTime: new Date(baseTime + 14 * 3600_000 + 21 * 60_000 + 8000).toISOString(), // 14:21:08
      type: 'BADGE_SWIPE',
      label: 'Badge Accepted (Officer Anand)',
      metadata: { badgeId: 'EMP-9021', doorName: 'Vault Outer Gate', accessResult: 'GRANTED' },
    });

    // 4. Alerts (!)
    this.events.push({
      id: 'alt-01',
      track: 'ALERT',
      startTime: new Date(baseTime + 14 * 3600_000 + 23 * 60_000 + 45000).toISOString(), // 14:23:45
      severity: 'CRITICAL',
      type: 'INTRUSION_ALERT',
      label: 'P1 Vault Perimeter Breach',
      metadata: { incidentId: 'INC-81722' },
    });

    // 5. Bookmarks
    this.bookmarks.push({
      id: 'bm-01',
      tenantId: 'BANK-001',
      cameraId: 'CAM-14',
      incidentId: 'INC-81722',
      timestamp: new Date(baseTime + 14 * 3600_000 + 23 * 60_000 + 47000).toISOString(), // 14:23:47
      title: 'Suspect enters vault door',
      createdBy: 'investigator-anand',
      createdAt: new Date().toISOString(),
    });
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
    const durationHours = (toMs - fromMs) / 3600_000;

    const filteredEvents = this.events.filter((e) => {
      const eTime = new Date(e.startTime).getTime();
      return eTime >= fromMs && eTime <= toMs;
    });

    const recording = [
      { start: query.from, end: new Date(fromMs + 14 * 3600_000).toISOString() },
      { start: new Date(fromMs + 14 * 3600_000 + 15000).toISOString(), end: query.to }, // 15s gap
    ];

    const motion = filteredEvents
      .filter((e) => e.track === 'MOTION')
      .map((e) => ({
        timestamp: e.startTime,
        durationMs: (e.metadata?.durationMs as number) || 3000,
      }));

    const aiEvents = filteredEvents
      .filter((e) => e.track === 'AI')
      .map((e) => ({
        timestamp: e.startTime,
        type: (e.type === 'VEHICLE' ? 'VEHICLE' : 'PERSON') as 'PERSON' | 'VEHICLE',
        confidence: (e.metadata?.confidence as number) || 0.95,
        label: e.label || e.type,
      }));

    const accessEvents = filteredEvents
      .filter((e) => e.track === 'ACCESS')
      .map((e) => ({
        timestamp: e.startTime,
        badgeId: (e.metadata?.badgeId as string) || 'EMP-001',
        doorName: (e.metadata?.doorName as string) || 'Door',
        accessResult: (e.metadata?.accessResult as 'GRANTED' | 'DENIED') || 'GRANTED',
      }));

    const alerts = filteredEvents
      .filter((e) => e.track === 'ALERT')
      .map((e) => ({
        timestamp: e.startTime,
        severity: e.severity || 'HIGH',
        title: e.label || e.type,
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
          recordingSeconds: Math.round(bucketSpanMs / 1000),
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
