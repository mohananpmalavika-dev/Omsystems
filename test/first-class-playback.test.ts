import { describe, it, expect } from 'vitest';
import {
  PlaybackCoordinatorService,
  SegmentResolverService,
  UnifiedTimelineService,
  IncidentPlaybackService,
} from '../src/playback/index.js';

describe('First-Class Playback & Unified Timeline Subsystem', () => {
  it('resolves virtual continuous timeline to keyframe-accurate segment offsets and prefetches next segments', () => {
    const resolver = new SegmentResolverService();
    const targetSeekDate = new Date('2026-08-17T00:01:14.500Z'); // 74.5s into recording (Segment 3)

    const seekResult = resolver.resolveSeek('CAM-14', targetSeekDate);
    expect(seekResult.segment.segmentId).toBe('seg-cam14-3');
    expect(seekResult.closestKeyframe).toBeDefined();
    expect(seekResult.closestKeyframe.timestampMs).toBeLessThanOrEqual(targetSeekDate.getTime());
    expect(seekResult.offsetFromKeyframeMs).toBeGreaterThanOrEqual(0);
    // Verifies continuous prefetch queue contains next segments
    expect(seekResult.prefetchSegments.length).toBeGreaterThan(0);
    expect(seekResult.prefetchSegments[0]?.segmentId).toBe('seg-cam14-4');
  });

  it('aggregates multi-track unified timeline with recording, motion, AI, access, alerts, and bookmarks', () => {
    const timelineService = new UnifiedTimelineService();
    const from = '2026-08-17T00:00:00.000Z';
    const to = '2026-08-17T23:59:59.000Z';

    const timeline = timelineService.getTimeline({
      cameraId: 'CAM-14',
      from,
      to,
    });

    expect(timeline.cameraId).toBe('CAM-14');
    expect(timeline.recording.length).toBeGreaterThan(0);
    expect(timeline.motion.length).toBeGreaterThanOrEqual(2);
    expect(timeline.aiEvents.some((e) => e.type === 'PERSON')).toBe(true);
    expect(timeline.aiEvents.some((e) => e.type === 'VEHICLE')).toBe(true);
    expect(timeline.accessEvents.length).toBeGreaterThanOrEqual(1);
    expect(timeline.alerts.some((a) => a.severity === 'CRITICAL')).toBe(true);
    expect(timeline.bookmarks.length).toBeGreaterThanOrEqual(1);

    // Multi-resolution timeline buckets for 24h zoom
    expect(timeline.buckets).toBeDefined();
    expect(timeline.buckets?.length).toBe(24);
  });

  it('supports multi-camera synchronized playback with master clock and drift tracking', () => {
    const coordinator = new PlaybackCoordinatorService();
    const startTime = '2026-08-17T14:20:00.000Z';

    const session = coordinator.createSession({
      cameraIds: ['CAM-14', 'CAM-15', 'CAM-16'],
      startTime,
      mode: 'SYNCHRONIZED',
      speed: 2,
    });

    expect(session.cameras.length).toBe(3);
    expect(session.mode).toBe('SYNCHRONIZED');
    expect(session.speed).toBe(2);

    // Master clock tick (1 second at 2x = 2 seconds advance)
    const tickResult = coordinator.syncTick(session.id, 1000);
    const expectedTime = new Date(new Date(startTime).getTime() + 2000).toISOString();
    expect(tickResult.masterTime).toBe(expectedTime);
    expect(session.currentTime).toBe(expectedTime);
    expect(Object.keys(tickResult.cameraDrifts).length).toBe(3);
  });

  it('performs frame stepping (forward +40ms and backward -40ms) with keyframe reverse decoding', () => {
    const coordinator = new PlaybackCoordinatorService();
    const startTime = '2026-08-17T14:23:42.000Z';

    const session = coordinator.createSession({
      cameraIds: ['CAM-14'],
      startTime,
    });

    // 1. Step Forward (+40ms for 25 FPS)
    const fwdSession = coordinator.stepFrameForward(session.id);
    expect(fwdSession.currentTime).toBe('2026-08-17T14:23:42.040Z');
    expect(fwdSession.state).toBe('PAUSED');

    // 2. Step Backward (-40ms)
    const backSession = coordinator.stepFrameBackward(session.id);
    expect(backSession.currentTime).toBe('2026-08-17T14:23:42.000Z');
    expect(backSession.state).toBe('PAUSED');
  });

  it('supports variable speeds (0.25x to 64x) and reverse playback', () => {
    const coordinator = new PlaybackCoordinatorService();
    const startTime = '2026-08-17T14:00:00.000Z';

    const session = coordinator.createSession({
      cameraIds: ['CAM-14'],
      startTime,
    });

    // Variable Speed
    coordinator.setSpeed(session.id, 16);
    expect(session.speed).toBe(16);

    // Reverse Playback
    coordinator.setDirection(session.id, 'REVERSE');
    expect(session.direction).toBe('REVERSE');

    // Tick 1s in reverse at 16x -> -16,000ms
    const tick = coordinator.syncTick(session.id, 1000);
    const expectedTime = new Date(new Date(startTime).getTime() - 16000).toISOString();
    expect(tick.masterTime).toBe(expectedTime);
  });

  it('supports go-to-time, event jump, and bookmark jumping along the virtual timeline', () => {
    const coordinator = new PlaybackCoordinatorService();
    const session = coordinator.createSession({
      cameraIds: ['CAM-14'],
      startTime: '2026-08-17T08:00:00.000Z',
    });

    // 1. Go-To-Time (Seek)
    coordinator.seek(session.id, '2026-08-17T10:00:00.000Z');
    expect(session.currentTime).toBe('2026-08-17T10:00:00.000Z');

    // 2. Jump to Next AI/Motion Event
    coordinator.jumpToEvent(session.id, 'NEXT', ['PERSON', 'VEHICLE', 'MOTION']);
    expect(new Date(session.currentTime).getTime()).toBeGreaterThan(new Date('2026-08-17T10:00:00.000Z').getTime());

    // 3. Add Bookmark at Current Position
    const bookmark = coordinator.addBookmark(session.id, 'Officer enters vault perimeter');
    expect(bookmark.title).toBe('Officer enters vault perimeter');
    expect(bookmark.timestamp).toBe(session.currentTime);
  });

  it('opens incident-centered playback with Digital Twin auto-mapped cameras and clips evidence', () => {
    const coordinator = new PlaybackCoordinatorService();
    const incidentService = new IncidentPlaybackService(coordinator);

    const alertTime = '2026-08-17T14:23:42.000Z';
    const { session, context } = incidentService.openIncidentSession({
      incidentId: 'INC-81722',
      alertTimestamp: alertTime,
      primaryCameraId: 'VAULT-01',
      userId: 'investigator-anand',
    });

    // Verifies automatic -30s pre-roll and +90s post-roll window
    expect(session.currentTime).toBe('2026-08-17T14:23:12.000Z');
    expect(context.preRollSeconds).toBe(30);
    expect(context.postRollSeconds).toBe(90);
    // Verifies Digital Twin resolved 3 contextual cameras (Primary + Corridor + Entrance)
    expect(session.cameras.length).toBe(3);
    expect(session.cameras.map((c) => c.cameraId)).toEqual(['VAULT-01', 'CORRIDOR-04', 'ENTRY-01']);

    // Marks IN/OUT and exports forensic evidence package
    const evidencePkg = incidentService.createEvidencePackageFromClip({
      sessionId: session.id,
      inTimestamp: '2026-08-17T14:22:40.000Z',
      outTimestamp: '2026-08-17T14:24:20.000Z',
      cameraIds: ['VAULT-01', 'CORRIDOR-04'],
      reason: 'P1 Vault Perimeter Intrusion Investigation',
      incidentId: 'INC-81722',
      investigatorUserId: 'investigator-anand',
    });

    expect(evidencePkg.evidencePackageId).toBeDefined();
    expect(evidencePkg.durationSeconds).toBe(100);
    expect(evidencePkg.manifestHash).toContain('sha256-sealed-');
    expect(Object.keys(evidencePkg.mediaUrls).length).toBe(2);
  });
});
