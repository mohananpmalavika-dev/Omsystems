/**
 * Production Tests for Physical Violence & Fight Detection in analytics-engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorDetector } from '../src/detectors/behavior-detector.js';
import { FightDetector } from '../src/human-analytics/behavior/fight-detector.js';
import { AnalyticsRegistry } from '../src/core/analytics-registry.js';
import type { DetectionFrame } from '../src/detectors/base-detector.js';
import type { PersonTrack, PersonObservation } from '../src/human-analytics/types.js';

function createSyntheticRGBFrame(width = 320, height = 240): Buffer {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      buf[idx] = (x + y) % 256;
      buf[idx + 1] = (x * 2) % 256;
      buf[idx + 2] = (y * 3) % 256;
    }
  }
  return buf;
}

describe('AnalyticsRegistry Violence Capability', () => {
  it('registers detector-violence with PRODUCTION maturity and enabled state', () => {
    const registry = new AnalyticsRegistry();
    const capability = registry.getCapability('detector-violence');

    expect(capability).toBeDefined();
    expect(capability?.detectorType).toBe('violence_detection');
    expect(capability?.maturity).toBe('production');
    expect(capability?.enabled).toBe(true);
    expect(capability?.supportsCpu).toBe(true);
    expect(capability?.supportsEdge).toBe(true);
  });
});

describe('BehaviorDetector Physical Fight Detection Engine', () => {
  let detector: BehaviorDetector;

  beforeEach(async () => {
    detector = new BehaviorDetector({
      fightingMotionThreshold: 30,
      aggressionDetectionEnabled: true,
    });
    await detector.initialize();
  });

  it('detects physical fighting with optical flow and limb kinematics on interacting persons', async () => {
    const width = 320;
    const height = 240;
    const frame1 = createSyntheticRGBFrame(width, height);
    const frame2 = createSyntheticRGBFrame(width, height);

    // Add high-frequency perturbation in interaction zone (x: 50..120, y: 50..120)
    for (let y = 50; y < 120; y++) {
      for (let x = 50; x < 120; x++) {
        const idx = (y * width + x) * 3;
        frame2[idx] = (frame1[idx] + 80) % 256;
        frame2[idx + 1] = (frame1[idx + 1] + 60) % 256;
        frame2[idx + 2] = (frame1[idx + 2] + 70) % 256;
      }
    }

    const t0 = new Date('2026-09-12T10:00:00.000Z');
    const t1 = new Date('2026-09-12T10:00:00.100Z');
    const t2 = new Date('2026-09-12T10:00:00.200Z');

    // Feed step 1: establishing baseline positions
    const f1: DetectionFrame = {
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: t0,
      imageData: frame1,
      width,
      height,
      frameNumber: 1,
      metadata: {
        detections: [
          { label: 'person', confidence: 0.92, trackId: 'p1', boundingBox: { x: 0.16, y: 0.20, width: 0.14, height: 0.35 } },
          { label: 'person', confidence: 0.90, trackId: 'p2', boundingBox: { x: 0.24, y: 0.20, width: 0.14, height: 0.35 } },
        ],
      },
    };
    await detector.detect(f1);

    // Feed step 2: high acceleration strike impulse with recoil
    const f2: DetectionFrame = {
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: t1,
      imageData: frame2,
      width,
      height,
      frameNumber: 2,
      metadata: {
        detections: [
          { label: 'person', confidence: 0.94, trackId: 'p1', boundingBox: { x: 0.20, y: 0.21, width: 0.14, height: 0.34 } },
          { label: 'person', confidence: 0.91, trackId: 'p2', boundingBox: { x: 0.22, y: 0.19, width: 0.14, height: 0.35 } },
        ],
      },
    };
    await detector.detect(f2);

    // Feed step 3: rapid recoil / counter-strike with high optical flow
    const f3: DetectionFrame = {
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: t2,
      imageData: frame1,
      width,
      height,
      frameNumber: 3,
      metadata: {
        detections: [
          { label: 'person', confidence: 0.93, trackId: 'p1', boundingBox: { x: 0.17, y: 0.20, width: 0.14, height: 0.35 } },
          { label: 'person', confidence: 0.92, trackId: 'p2', boundingBox: { x: 0.25, y: 0.21, width: 0.14, height: 0.35 } },
        ],
      },
    };
    const results = await detector.detect(f3);

    const fightResult = results.find((r) => r.detectionType === 'fighting');
    expect(fightResult).toBeDefined();
    expect(fightResult?.confidence).toBeGreaterThan(0.65);
    expect(fightResult?.requiresAlert).toBe(true);
    expect(fightResult?.metadata?.participants).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(fightResult?.metadata?.peakAcceleration).toBeGreaterThan(0);
  });
});

describe('HumanAnalytics FightDetector Multi-Frame Kinetics', () => {
  let detector: FightDetector;

  beforeEach(() => {
    detector = new FightDetector('tenant-01', 'cam-01', {
      minRelativeVelocity: 15,
      minLimbAcceleration: 25,
      candidatePersistenceMs: 100,
      confirmationWindowMs: 200,
    });
  });

  it('classifies persistent combat encounters using ballistic limb strike kinematics', async () => {
    const makeObservation = (
      t: Date,
      x: number,
      y: number,
      wristX: number,
      wristY: number,
    ): PersonObservation => ({
      tenantId: 'tenant-01',
      cameraId: 'cam-01',
      frameId: `f_${t.getTime()}`,
      timestamp: t,
      localTrackId: 't1',
      boundingBox: { x, y, width: 40, height: 100 },
      detectionConfidence: 0.95,
      footPoint: { x: x + 20, y: y + 100 },
      keypoints: {
        nose: { x: x + 20, y: y + 10, confidence: 0.9 },
        leftEye: { x: x + 18, y: y + 8, confidence: 0.9 },
        rightEye: { x: x + 22, y: y + 8, confidence: 0.9 },
        leftEar: { x: x + 15, y: y + 10, confidence: 0.9 },
        rightEar: { x: x + 25, y: y + 10, confidence: 0.9 },
        leftShoulder: { x: x + 10, y: y + 25, confidence: 0.9 },
        rightShoulder: { x: x + 30, y: y + 25, confidence: 0.9 },
        leftElbow: { x: x + 8, y: y + 45, confidence: 0.9 },
        rightElbow: { x: x + 32, y: y + 45, confidence: 0.9 },
        leftWrist: { x: wristX, y: wristY, confidence: 0.95 },
        rightWrist: { x: x + 35, y: y + 60, confidence: 0.9 },
        leftHip: { x: x + 15, y: y + 55, confidence: 0.9 },
        rightHip: { x: x + 25, y: y + 55, confidence: 0.9 },
        leftKnee: { x: x + 15, y: y + 80, confidence: 0.9 },
        rightKnee: { x: x + 25, y: y + 80, confidence: 0.9 },
        leftAnkle: { x: x + 15, y: y + 100, confidence: 0.9 },
        rightAnkle: { x: x + 25, y: y + 100, confidence: 0.9 },
      },
    });

    const timestamps = [
      new Date('2026-09-12T10:00:00.000Z'),
      new Date('2026-09-12T10:00:00.100Z'),
      new Date('2026-09-12T10:00:00.200Z'),
      new Date('2026-09-12T10:00:00.300Z'),
      new Date('2026-09-12T10:00:00.400Z'),
    ];

    const trackA: PersonTrack = {
      trackId: 'trackA',
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      startedAt: timestamps[0],
      lastSeenAt: timestamps[4],
      status: 'confirmed',
      observations: [],
      currentZoneIds: [],
      dwellTimeSeconds: 0.4,
      isStationary: false,
      speed: 25,
      velocity: { dx: 18, dy: 5 },
    };

    const trackB: PersonTrack = {
      trackId: 'trackB',
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      startedAt: timestamps[0],
      lastSeenAt: timestamps[4],
      status: 'confirmed',
      observations: [],
      currentZoneIds: [],
      dwellTimeSeconds: 0.4,
      isStationary: false,
      speed: 22,
      velocity: { dx: -15, dy: -3 },
    };

    // Simulate punch strike sequence with high wrist velocity and deceleration
    const wristOffsets = [
      { ax: 20, ay: 60, bx: 80, by: 60 },
      { ax: 45, ay: 55, bx: 70, by: 58 },
      { ax: 65, ay: 52, bx: 62, by: 54 }, // Contact strike!
      { ax: 35, ay: 58, bx: 72, by: 56 }, // Recoil
      { ax: 62, ay: 53, bx: 64, by: 55 }, // Second strike!
    ];

    let confirmedEvents: any[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const posA = 50 + i * 2;
      const posB = 85 - i * 2;
      trackA.observations.push(makeObservation(t, posA, 50, posA + wristOffsets[i].ax, 50 + wristOffsets[i].ay));
      trackB.observations.push(makeObservation(t, posB, 50, posB + wristOffsets[i].bx, 50 + wristOffsets[i].by));

      const events = await detector.detectFighting([trackA, trackB], t, `f_${i}`);
      if (events.length > 0) {
        confirmedEvents = confirmedEvents.concat(events);
      }
    }

    expect(confirmedEvents.length).toBeGreaterThan(0);
    const fight = confirmedEvents[0];
    expect(fight.participantTrackIds).toEqual(expect.arrayContaining(['trackA', 'trackB']));
    expect(fight.finalConfidence).toBeGreaterThanOrEqual(0.7);
    expect(fight.status).toBe('confirmed');
  });
});
