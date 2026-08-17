import { describe, it, expect } from 'vitest';
import {
  ClockSynchronizationService,
  TimestampMapperService,
  SegmentResolverService,
  InvestigationSessionService,
} from '../src/playback/index.js';

describe('Synchronized Multi-Camera Playback & Investigation Clock Subsystem', () => {
  it('models time-dependent clock drift via piecewise linear interpolation (offset = f(time))', () => {
    const clockSync = new ClockSynchronizationService();
    const baseUtc = new Date('2026-08-17T14:00:00.000Z').getTime();

    // 14:00 offset = +400ms
    clockSync.recordObservation({
      deviceId: 'CAM-DRIFT-01',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc + 400,
      serverTimestamp: baseUtc,
      offsetMs: 400,
      source: 'ONVIF',
      confidence: 0.98,
    });

    // 15:00 offset = +700ms (300ms drift over 1 hour)
    clockSync.recordObservation({
      deviceId: 'CAM-DRIFT-01',
      measuredAtUtc: baseUtc + 3600_000,
      deviceTimestamp: baseUtc + 3600_000 + 700,
      serverTimestamp: baseUtc + 3600_000,
      offsetMs: 700,
      source: 'ONVIF',
      confidence: 0.98,
    });

    // At 14:30 (midpoint), expected offset is exactly +550ms
    const estAt1430 = clockSync.getEstimatedOffsetAtUtc('CAM-DRIFT-01', baseUtc + 1800_000);
    expect(estAt1430.offsetMs).toBe(550);
    expect(estAt1430.confidence).toBe(0.98);

    // Converts Device local timestamp to Canonical Server UTC
    const devTime = baseUtc + 1800_000 + 550;
    const canonUtc = clockSync.deviceToCanonicalUtc('CAM-DRIFT-01', devTime);
    expect(canonUtc).toBe(baseUtc + 1800_000);
  });

  it('detects abrupt clock epoch jumps (NTP corrections / reboots) without corrupting previous history', () => {
    const clockSync = new ClockSynchronizationService();
    const baseUtc = new Date('2026-08-17T09:00:00.000Z').getTime();

    // Epoch 1: 09:00 to 14:00 with offset +5.1s
    clockSync.recordObservation({
      deviceId: 'CAM-22',
      measuredAtUtc: baseUtc,
      deviceTimestamp: baseUtc + 5100,
      serverTimestamp: baseUtc,
      offsetMs: 5100,
      source: 'RTSP',
      confidence: 0.95,
    });

    // Sudden NTP Jump at 14:12:03: clock jumps by +17 seconds -> offset becomes +22,100ms
    const jumpUtc = baseUtc + 5 * 3600_000;
    const epoch2 = clockSync.recordObservation({
      deviceId: 'CAM-22',
      measuredAtUtc: jumpUtc,
      deviceTimestamp: jumpUtc + 22100,
      serverTimestamp: jumpUtc,
      offsetMs: 22100,
      source: 'NTP',
      confidence: 0.99,
    });

    expect(epoch2.reason).toBe('NTP_CORRECTION');
    expect(epoch2.offsetStartMs).toBe(22100);

    const epochs = clockSync.getEpochs('CAM-22');
    expect(epochs.length).toBeGreaterThanOrEqual(2);
    // Historical epoch 1 was closed with validToServerUtc
    expect(epochs[0]?.validToServerUtc).toBe(jumpUtc);
  });

  it('translates Canonical Server UTC to exact 90kHz PTS values and segment byte offsets', () => {
    const clockSync = new ClockSynchronizationService();
    const resolver = new SegmentResolverService();
    const mapper = new TimestampMapperService(clockSync, resolver);

    // Canonical UTC: 2026-08-17T00:00:07.000Z (7.0s into segment 1)
    const targetUtcMs = new Date('2026-08-17T00:00:07.000Z').getTime();
    const mediaPos = mapper.canonicalToMedia('CAM-14', targetUtcMs);

    expect(mediaPos.segmentId).toBe('seg-cam14-1');
    expect(mediaPos.mediaOffsetMs).toBe(7000);
    // 7.0s * 90,000 Hz = 630,000 + 180,000 firstPts = 810,000 PTS
    expect(mediaPos.targetPts).toBe(810_000n);
    expect(mediaPos.nearestKeyframePts).toBeLessThanOrEqual(mediaPos.targetPts);
    expect(mediaPos.nearestKeyframeOffsetBytes).toBeGreaterThanOrEqual(0);

    // Invert PTS back to Canonical UTC
    const invertedUtc = mapper.mediaToCanonical(
      'CAM-14',
      new Date('2026-08-17T00:00:00.000Z').getTime(),
      810_000n,
      180_000n
    );
    expect(invertedUtc).toBe(targetUtcMs);
  });

  it('executes barrier-based synchronized seeking across cameras with heterogeneous clock offsets (+5.2s, -3.1s, +0.1s)', () => {
    const service = new InvestigationSessionService();
    const startUtcMs = new Date('2026-08-17T14:32:17.000Z').getTime();

    const session = service.createSession({
      cameraIds: ['CAM-01', 'CAM-02', 'CAM-03'],
      startUtcMs,
      synchronizationToleranceMs: 100,
    });

    expect(session.clock.currentUtcMs).toBe(startUtcMs);
    expect(session.cameras.size).toBe(3);

    // Seek all cameras to target investigation time: 14:32:17.000 UTC
    const seekResult = service.seek(session.id, startUtcMs);
    expect(seekResult.barrierPassed).toBe(true);
    expect(seekResult.session.clock.generation).toBe(2);

    const cam1 = seekResult.session.cameras.get('CAM-01')!;
    const cam2 = seekResult.session.cameras.get('CAM-02')!;
    const cam3 = seekResult.session.cameras.get('CAM-03')!;

    // All cameras report exact same canonical UTC time
    expect(cam1.canonicalUtcMs).toBe(startUtcMs);
    expect(cam2.canonicalUtcMs).toBe(startUtcMs);
    expect(cam3.canonicalUtcMs).toBe(startUtcMs);

    // But each camera adjusted for its specific clock offset (+5.2s, -3.1s, +0.1s)
    expect(cam1.deviceTimestamp).toBeGreaterThan(startUtcMs);
    expect(cam2.deviceTimestamp).toBeLessThan(startUtcMs);
    expect(cam1.syncQuality).toBe('EXCELLENT');
    expect(cam1.isReadyAtBarrier).toBe(true);
  });

  it('handles barrier timeout and gap isolation without freezing the shared session (Camera 4 gap)', () => {
    const service = new InvestigationSessionService();
    const startUtcMs = new Date('2026-08-17T14:32:17.000Z').getTime();

    const session = service.createSession({
      cameraIds: ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'],
      startUtcMs,
    });

    const seekResult = service.seek(session.id, startUtcMs);
    // Barrier passes because Cameras 1, 2, 3 are ready
    expect(seekResult.barrierPassed).toBe(true);

    const cam4 = seekResult.session.cameras.get('CAM-04')!;
    expect(cam4.hasRecordingCoverage).toBe(false);
    expect(cam4.statusText).toBe('NO RECORDING');
    expect(cam4.isReadyAtBarrier).toBe(false);

    // Play continues on the shared clock regardless of Camera 4's gap
    const playingSession = service.play(session.id, 1.0);
    expect(playingSession.clock.state).toBe('PLAYING');
  });

  it('performs dynamic drift correction with tiered response policies (<80ms, 80-250ms, 250-750ms, >750ms)', () => {
    const service = new InvestigationSessionService();
    const startUtcMs = new Date('2026-08-17T14:32:17.000Z').getTime();

    const session = service.createSession({
      cameraIds: ['CAM-01', 'CAM-02', 'CAM-03'],
      startUtcMs,
    });

    service.play(session.id, 1.0);
    const tickRes = service.syncTick(session.id, 1000);

    expect(tickRes.masterUtcMs).toBe(startUtcMs + 1000);
    // CAM-01 drift 18ms (<80ms) -> NO_ACTION
    expect(tickRes.actions['CAM-01']).toBe('NO_ACTION');
    // CAM-02 drift -120ms (80-250ms) -> FINE_RATE_ADJUST
    expect(tickRes.actions['CAM-02']).toBe('FINE_RATE_ADJUST');
    // CAM-03 drift 340ms (250-750ms) -> DROP_HOLD_FRAMES
    expect(tickRes.actions['CAM-03']).toBe('DROP_HOLD_FRAMES');
  });

  it('supports deterministic shared time stepping (+40ms) and camera-frame stepping', () => {
    const service = new InvestigationSessionService();
    const startUtcMs = new Date('2026-08-17T14:32:17.000Z').getTime();

    const session = service.createSession({
      cameraIds: ['CAM-01', 'CAM-02'],
      startUtcMs,
    });

    // 1. Shared Time Step (+40ms across all cameras)
    const steppedSession = service.stepFrame(session.id, 'SHARED_TIME');
    expect(steppedSession.clock.currentUtcMs).toBe(startUtcMs + 40);
    expect(steppedSession.cameras.get('CAM-01')?.canonicalUtcMs).toBe(startUtcMs + 40);
    expect(steppedSession.cameras.get('CAM-02')?.canonicalUtcMs).toBe(startUtcMs + 40);

    // 2. Camera-Specific Step
    service.stepFrame(session.id, 'CAMERA_PHYSICAL', 'CAM-01');
    expect(steppedSession.cameras.get('CAM-01')?.canonicalUtcMs).toBe(startUtcMs + 80);
    expect(steppedSession.cameras.get('CAM-02')?.canonicalUtcMs).toBe(startUtcMs + 40);
  });

  it('generates forensic evidence clock metadata with camera offsets and synchronization quality', () => {
    const service = new InvestigationSessionService();
    const startUtcMs = new Date('2026-08-17T14:32:17.000Z').getTime();

    const session = service.createSession({
      cameraIds: ['CAM-01', 'CAM-02', 'CAM-03'],
      startUtcMs,
    });

    const meta = service.getForensicEvidenceMetadata(session.id) as any;
    expect(meta.investigationId).toBe(session.id);
    expect(meta.masterUtc).toBe('2026-08-17T14:32:17.000Z');
    expect(meta.timezoneDisplayed).toBe('Asia/Kolkata');
    expect(meta.cameras.length).toBe(3);
    expect(meta.cameras[0].cameraId).toBe('CAM-01');
    expect(meta.cameras[0].clockOffsetMs).toBeDefined();
    expect(meta.cameras[0].clockConfidence).toBeGreaterThan(0.9);
  });
});
