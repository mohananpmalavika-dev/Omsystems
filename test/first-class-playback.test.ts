import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  PlaybackCoordinatorService,
  SegmentResolverService,
  UnifiedTimelineService,
  IncidentPlaybackService,
} from '../src/playback/index.js';

function recordingIndex(cameraId: string, startTime: string, count = 5) {
  const start = Date.parse(startTime);
  return Array.from({ length: count }, (_, index) => {
    const from = start + index * 30_000;
    return { segmentId: `seg-${cameraId.toLowerCase().replace(/[^a-z0-9]/g, '')}-${index + 1}`, cameraId,
      startTime: new Date(from), endTime: new Date(from + 30_000), durationMs: 30_000,
      storagePath: `/fixture/${cameraId}/${index}.mp4`, storageNode: 'test-storage', codec: 'h264', discontinuityBefore: false,
      keyframes: Array.from({ length: 15 }, (_, frame) => ({ timestampMs: from + frame * 2000, byteOffset: frame * 1024, frameNumber: frame * 50 })) };
  });
}

describe('First-Class Playback & Unified Timeline Subsystem', () => {
  it('resolves virtual continuous timeline to keyframe-accurate segment offsets and prefetches next segments', () => {
    const resolver = new SegmentResolverService();
    resolver.registerSegments('CAM-14', recordingIndex('CAM-14', '2026-08-17T00:00:00.000Z').reverse());
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
    for (const event of [
      { id: 'recording', track: 'RECORDING', type: 'VIDEO', endTime: '2026-08-17T00:30:00.000Z' },
      { id: 'motion-1', track: 'MOTION', type: 'MOTION', metadata: { durationMs: 2000 } },
      { id: 'motion-2', track: 'MOTION', type: 'MOTION', metadata: { durationMs: 3000 } },
      { id: 'person', track: 'AI', type: 'PERSON', label: 'Person', metadata: { confidence: 0.9 } },
      { id: 'vehicle', track: 'AI', type: 'VEHICLE', label: 'Vehicle', metadata: { confidence: 0.9 } },
      { id: 'access', track: 'ACCESS', type: 'DOOR', metadata: { badgeId: 'badge', doorName: 'Entrance', accessResult: 'GRANTED' } },
      { id: 'alert', track: 'ALERT', type: 'INTRUSION', label: 'Verified fixture alert', severity: 'CRITICAL' },
    ] as any[]) timelineService.ingest({ ...event, cameraId: 'CAM-14', startTime: from });
    timelineService.addBookmark({ id: 'bookmark', tenantId: 'test-bank', cameraId: 'CAM-14', timestamp: from,
      title: 'Review entry', createdBy: 'test-operator', createdAt: from });

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

  it('resolves frame-step requests (forward +40ms and backward -40ms) against recording indexes', () => {
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
    coordinator.segmentResolver.registerSegments('CAM-14', recordingIndex('CAM-14', '2026-08-17T10:00:00.000Z'));
    coordinator.timelineService.ingest({ id: 'event', cameraId: 'CAM-14', track: 'AI', type: 'PERSON', startTime: '2026-08-17T10:00:30.000Z' });
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

  it('opens incident-centered playback with caller-provided cameras and delegates verified evidence export', async () => {
    const coordinator = new PlaybackCoordinatorService();
    const exporter = vi.fn(async (input: any) => ({ evidencePackageId: 'fixture-package', incidentId: input.incidentId,
      inTimestamp: input.inTimestamp, outTimestamp: input.outTimestamp, durationSeconds: 100, cameraIds: input.cameraIds,
      manifestHash: createHash('sha256').update('fixture-media').digest('hex'), sealedAt: new Date().toISOString(),
      investigatorUserId: input.investigatorUserId, mediaUrls: Object.fromEntries(input.cameraIds.map((id: string) => [id, `/fixture/evidence/${id}`])) }));
    const incidentService = new IncidentPlaybackService(coordinator, exporter);

    const alertTime = '2026-08-17T14:23:42.000Z';
    const { session, context } = incidentService.openIncidentSession({
      incidentId: 'INC-81722',
      alertTimestamp: alertTime,
      primaryCameraId: 'VAULT-01',
      userId: 'investigator-anand',
      tenantId: 'test-bank',
      relatedCameras: [
        { cameraId: 'CORRIDOR-04', cameraName: 'Corridor', reason: 'Authorized context', priority: 2 },
        { cameraId: 'ENTRY-01', cameraName: 'Entrance', reason: 'Authorized context', priority: 3 },
      ],
    });

    // Verifies automatic -30s pre-roll and +90s post-roll window
    expect(session.currentTime).toBe('2026-08-17T14:23:12.000Z');
    expect(context.preRollSeconds).toBe(30);
    expect(context.postRollSeconds).toBe(90);
    // Verifies Digital Twin resolved 3 contextual cameras (Primary + Corridor + Entrance)
    expect(session.cameras.length).toBe(3);
    expect(session.cameras.map((c) => c.cameraId)).toEqual(['VAULT-01', 'CORRIDOR-04', 'ENTRY-01']);

    // Marks IN/OUT and exports forensic evidence package
    const evidencePkg = await incidentService.createEvidencePackageFromClip({
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
    expect(evidencePkg.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(exporter).toHaveBeenCalledOnce();
    expect(Object.keys(evidencePkg.mediaUrls).length).toBe(2);
  });

  it('does not invent recordings, related cameras or sealed evidence when integrations are unavailable', async () => {
    const resolver = new SegmentResolverService();
    expect(() => resolver.resolveSeek('missing', new Date('2026-08-17T00:00:00Z'))).toThrow('recording_segment_not_found');
    const coordinator = new PlaybackCoordinatorService();
    const service = new IncidentPlaybackService(coordinator);
    const { session, context } = service.openIncidentSession({ incidentId: 'incident', primaryCameraId: 'one-camera',
      alertTimestamp: '2026-08-17T00:00:00Z', userId: 'operator' });
    expect(context.cameras).toHaveLength(1);
    expect(context.events).toHaveLength(0);
    expect(session.resolvedSegmentsCount).toBe(0);
    expect(session.cameras[0]?.status).toBe('NO_RECORDING');
    await expect(service.createEvidencePackageFromClip({ sessionId: session.id, inTimestamp: '2026-08-17T00:00:00Z',
      outTimestamp: '2026-08-17T00:01:00Z', cameraIds: ['one-camera'], investigatorUserId: 'operator', reason: 'Review' }))
      .rejects.toThrow('evidence_export_engine_unavailable');
  });

  it('uses half-open segment boundaries and refuses missing keyframe indexes', () => {
    const resolver = new SegmentResolverService();
    const segments = recordingIndex('camera', '2026-08-17T00:00:00Z');
    resolver.registerSegments('camera', segments);
    expect(resolver.resolveSeek('camera', segments[0]!.endTime).segment.segmentId).toBe(segments[1]!.segmentId);
    expect(() => resolver.resolveSeek('camera', segments.at(-1)!.endTime)).toThrow('recording_segment_not_found');
    resolver.registerSegments('camera', [{ ...segments[0]!, keyframes: [] }]);
    expect(() => resolver.resolveSeek('camera', segments[0]!.startTime)).toThrow('recording_keyframe_unavailable');
  });

  it('keeps available camera tracks usable when another camera has a recording gap', () => {
    const coordinator = new PlaybackCoordinatorService();
    coordinator.segmentResolver.registerSegments('available', recordingIndex('available', '2026-08-17T00:00:00Z'));
    const session = coordinator.createSession({ cameraIds: ['available', 'missing'], startTime: '2026-08-17T00:00:00Z' });
    coordinator.seek(session.id, '2026-08-17T00:00:05Z');
    expect(session.state).toBe('PAUSED');
    expect(session.cameras[0]?.status).toBe('READY');
    expect(session.cameras[1]).toMatchObject({ status: 'NO_RECORDING' });
    expect(session.cameras[1]?.actualTime).toBeUndefined();
    expect(() => coordinator.seek(session.id, 'invalid')).toThrow('invalid_playback_timestamp');
    expect(session.currentTime).toBe('2026-08-17T00:00:05.000Z');
  });

  it('expires playback sessions instead of retaining live access forever', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-13T12:00:00Z').getTime());
    try {
      const coordinator = new PlaybackCoordinatorService();
      const session = coordinator.createSession({ cameraIds: ['camera'], startTime: '2026-08-17T00:00:00Z' });
      now.mockReturnValue(Date.parse(session.expiresAt));
      expect(coordinator.getSession(session.id)).toBeUndefined();
    } finally { now.mockRestore(); }
  });

  it('restores stream access after seeking out of a gap and keeps frame steps inside the index', () => {
    const coordinator = new PlaybackCoordinatorService();
    coordinator.segmentResolver.registerSegments('camera', recordingIndex('camera', '2026-08-17T00:00:00Z'));
    const session = coordinator.createSession({ cameraIds: ['camera'], startTime: '2026-08-17T00:00:00Z' });
    coordinator.seek(session.id, '2026-08-17T01:00:00Z');
    expect(session.cameras[0]?.streamUrl).toBeUndefined();
    coordinator.seek(session.id, '2026-08-17T00:00:05Z');
    expect(session.cameras[0]).toMatchObject({ status: 'READY', streamUrl: `/api/v1/playback/stream/${session.id}/camera` });
    coordinator.seek(session.id, '2026-08-17T00:02:29.980Z');
    coordinator.stepFrameForward(session.id);
    expect(session.cameras[0]?.status).toBe('NO_RECORDING');
    expect(session.cameras[0]?.actualTime).toBeUndefined();
  });
});
