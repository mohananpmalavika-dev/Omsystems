import { describe, it, expect } from 'vitest';
import {
  StreamStateMachine,
  StreamState,
  ConnectionMilestone,
} from '../src/media/supervision/stream-state-machine.js';
import {
  StreamErrorClassifier,
  FailureClass,
} from '../src/media/supervision/stream-metrics.js';
import { ReconnectPolicy } from '../src/media/supervision/reconnect-policy.js';
import { TimestampMonitor } from '../src/media/supervision/timestamp-monitor.js';
import { StreamHealthEvaluator, StreamHealth } from '../src/media/supervision/stream-health-evaluator.js';
import { StreamSupervisor } from '../src/media/supervision/stream-supervisor.js';
import { StreamSupervisorManager } from '../src/media/supervision/stream-supervisor-manager.js';

describe('Stream Supervision Subsystem (Production VMS Core)', () => {
  it('enforces strict state transitions and rejects illegal state jumps', () => {
    const sm = new StreamStateMachine(StreamState.DISCONNECTED);
    expect(sm.getState()).toBe(StreamState.DISCONNECTED);

    // Valid: DISCONNECTED -> CONNECTING
    sm.transition(StreamState.CONNECTING, 'Initiate RTSP connection');
    expect(sm.getState()).toBe(StreamState.CONNECTING);

    // Valid: CONNECTING -> AUTHENTICATING -> STREAMING -> DEGRADED -> RECONNECTING -> CONNECTING
    sm.transition(StreamState.AUTHENTICATING, 'Credentials challenged');
    sm.transition(StreamState.STREAMING, 'Full video pipeline operational');
    sm.transition(StreamState.DEGRADED, 'Frame rate dropped below threshold');
    sm.transition(StreamState.RECONNECTING, 'Frame timeout watchdog triggered');
    sm.transition(StreamState.CONNECTING, 'Restarting RTSP connection');

    // Illegal: Cannot jump directly from CONNECTING to DEGRADED
    expect(() => {
      sm.transition(StreamState.DEGRADED, 'Illegal jump');
    }).toThrow(/Illegal stream state transition/);
  });

  it('records connection establishment milestones sequentially', () => {
    const sm = new StreamStateMachine(StreamState.DISCONNECTED);
    sm.transition(StreamState.CONNECTING, 'Start connect');

    sm.recordMilestone(ConnectionMilestone.TCP_CONNECTED);
    sm.recordMilestone(ConnectionMilestone.RTSP_OPTIONS_OK);
    sm.recordMilestone(ConnectionMilestone.AUTH_CHALLENGE_ACCEPTED);

    expect(sm.getState()).toBe(StreamState.AUTHENTICATING);
    expect(sm.hasMilestone(ConnectionMilestone.TCP_CONNECTED)).toBe(true);
    expect(sm.hasMilestone(ConnectionMilestone.AUTH_CHALLENGE_ACCEPTED)).toBe(true);

    sm.recordMilestone(ConnectionMilestone.DESCRIBE_OK);
    sm.recordMilestone(ConnectionMilestone.SDP_VALIDATED);
    sm.recordMilestone(ConnectionMilestone.SETUP_OK);
    sm.recordMilestone(ConnectionMilestone.PLAY_OK);
    sm.recordMilestone(ConnectionMilestone.RTP_PACKETS_RECEIVED);
    sm.recordMilestone(ConnectionMilestone.FRAME_DECODED);
    sm.recordMilestone(ConnectionMilestone.KEYFRAME_RECEIVED);
    sm.recordMilestone(ConnectionMilestone.TIMESTAMP_ADVANCING);
    sm.recordMilestone(ConnectionMilestone.STREAMING_ESTABLISHED);

    expect(sm.getState()).toBe(StreamState.STREAMING);
    expect(sm.getCompletedMilestones().length).toBe(12);
  });

  it('classifies native stderr and errors into structured domain errors and failure classes', () => {
    const authErr = StreamErrorClassifier.classify('RTSP/1.0 401 Unauthorized');
    expect(authErr.code).toBe('AUTH_FAILED');
    expect(authErr.failureClass).toBe(FailureClass.AUTHENTICATION);

    const pathErr = StreamErrorClassifier.classify('RTSP/1.0 404 Stream Not Found');
    expect(pathErr.code).toBe('DESCRIBE_FAILED');
    expect(pathErr.failureClass).toBe(FailureClass.CONFIGURATION);

    const timeoutErr = StreamErrorClassifier.classify('Connection timed out');
    expect(timeoutErr.code).toBe('RTSP_TIMEOUT');
    expect(timeoutErr.failureClass).toBe(FailureClass.NETWORK);

    const decodeErr = StreamErrorClassifier.classify('Invalid NAL unit size, corrupt slice header');
    expect(decodeErr.code).toBe('DECODE_FAILURE');
    expect(decodeErr.failureClass).toBe(FailureClass.MEDIA);
  });

  it('implements exponential backoff with jitter and stable healthy window reset', () => {
    const policy = new ReconnectPolicy(60);

    // Attempt 0: ~1000ms (+/- 20%)
    const delay0 = policy.getDelay(0);
    expect(delay0).toBeGreaterThanOrEqual(800);
    expect(delay0).toBeLessThanOrEqual(1200);

    // Attempt 3: ~10000ms (+/- 20%)
    const delay3 = policy.getDelay(3);
    expect(delay3).toBeGreaterThanOrEqual(8000);
    expect(delay3).toBeLessThanOrEqual(12000);

    // Stable window reset logic (60s)
    const now = Date.now();
    const healthy10sAgo = new Date(now - 10000);
    expect(policy.shouldResetBackoff(healthy10sAgo, now)).toBe(false);

    const healthy65sAgo = new Date(now - 65000);
    expect(policy.shouldResetBackoff(healthy65sAgo, now)).toBe(true);
  });

  it('evaluates frame & keyframe watchdogs (Healthy -> Degraded -> Reconnect)', () => {
    const evaluator = new StreamHealthEvaluator({
      frameDegradedMs: 5000,
      frameFailureMs: 10000,
      keyframeDegradedMs: 30000,
      keyframeFailureMs: 60000,
      packetLossDegradedPct: 1.0,
      packetLossFailurePct: 5.0,
      minFpsHealthyRatio: 0.8,
      minFpsDegradedRatio: 0.5,
    });

    const now = Date.now();

    // 1. Healthy stream (frame 200ms ago, keyframe 2s ago)
    const healthyStatus: any = {
      state: StreamState.STREAMING,
      lastFrameAt: new Date(now - 200),
      lastKeyframeAt: new Date(now - 2000),
      fps: 25,
      expectedFps: 25,
      packetLossPercent: 0.1,
    };
    const evalHealthy = evaluator.evaluate(healthyStatus, now);
    expect(evalHealthy.health).toBe(StreamHealth.HEALTHY);

    // 2. Degraded stream (frame 6s ago, FPS 12 instead of 25)
    const degradedStatus: any = {
      state: StreamState.STREAMING,
      lastFrameAt: new Date(now - 6000),
      lastKeyframeAt: new Date(now - 10000),
      fps: 12,
      expectedFps: 25,
      packetLossPercent: 2.5,
    };
    const evalDegraded = evaluator.evaluate(degradedStatus, now);
    expect(evalDegraded.health).toBe(StreamHealth.DEGRADED);
    expect(evalDegraded.recommendedState).toBe(StreamState.DEGRADED);

    // 3. Frozen stream requiring reconnect (frame 14s ago)
    const frozenStatus: any = {
      state: StreamState.STREAMING,
      lastFrameAt: new Date(now - 14000),
      lastKeyframeAt: new Date(now - 20000),
      fps: 0,
      expectedFps: 25,
    };
    const evalFrozen = evaluator.evaluate(frozenStatus, now);
    expect(evalFrozen.health).toBe(StreamHealth.UNHEALTHY);
    expect(evalFrozen.recommendedState).toBe(StreamState.RECONNECTING);
  });

  it('validates timestamp progression and measures clock drift', () => {
    const monitor = new TimestampMonitor();
    const serverTime = new Date('2026-08-17T12:00:00.000Z');

    // 1. Monotonic progression
    const res1 = monitor.update(1000, 1000, new Date('2026-08-17T12:00:01.200Z'), serverTime);
    expect(res1.isProgressionHealthy).toBe(true);
    expect(res1.clockDriftStatus).toBe('HEALTHY'); // 1.2s offset (<5s)

    // Frame 2 (+40ms for 25 FPS)
    const res2 = monitor.update(1040, 1040, new Date('2026-08-17T12:00:01.240Z'), serverTime);
    expect(res2.isProgressionHealthy).toBe(true);

    // 2. Clock drift warning (offset 12s)
    const resDrift = monitor.update(1080, 1080, new Date('2026-08-17T12:00:12.000Z'), serverTime);
    expect(resDrift.clockDriftStatus).toBe('WARNING');
  });

  it('handles substream fallback and calculates availability SLAs', async () => {
    const manager = new StreamSupervisorManager();

    // Create Main Stream & Sub Stream supervisors
    const mainSupervisor = await manager.createSupervisor({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-118-04',
      streamId: 'stream:BR-118:CAM-118-04:main',
      profileId: 'main',
      rtspUrl: 'rtsp://10.100.1.24:554/main',
      expectedFps: 25,
    });

    const subSupervisor = await manager.createSupervisor({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-118-04',
      streamId: 'stream:BR-118:CAM-118-04:sub',
      profileId: 'sub',
      rtspUrl: 'rtsp://10.100.1.24:554/sub',
      expectedFps: 15,
    });

    // Start both
    await mainSupervisor.start();
    await subSupervisor.start();

    // Initially both streaming -> Camera is HEALTHY on main profile
    let cameraState = manager.getCameraOperationalState('CAM-118-04');
    expect(cameraState.operationalState).toBe('HEALTHY');
    expect(cameraState.activeProfile).toBe('main');

    // Simulate Main stream failure (Auth/Network drop) while Substream stays active
    mainSupervisor.handleError('Connection timed out');
    cameraState = manager.getCameraOperationalState('CAM-118-04');

    // Substream fallback: Camera is DEGRADED (active on substream) rather than OFFLINE!
    expect(cameraState.operationalState).toBe('DEGRADED');
    expect(cameraState.activeProfile).toBe('sub');
    expect(cameraState.reason).toContain('substream active in fallback mode');

    // Availability SLA
    const sla = manager.computeAvailability('CAM-118-04');
    expect(sla.availability24hPct).toBeGreaterThan(95);
    expect(sla.availability7dPct).toBeGreaterThan(95);
  });

  it('protects against race conditions with fencing tokens / generations', async () => {
    const supervisor = new StreamSupervisor({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-118-09',
      streamId: 'stream:BR-118:CAM-118-09:main',
      profileId: 'main',
      rtspUrl: 'rtsp://10.100.1.29:554/main',
    });

    await supervisor.start();
    const initialGen = supervisor.getGeneration();
    expect(initialGen).toBeGreaterThan(0);

    await supervisor.stop('User stopped stream');
    expect(supervisor.getGeneration()).toBe(initialGen + 1);
    expect(supervisor.getStatus().state).toBe(StreamState.DISCONNECTED);
  });
});
