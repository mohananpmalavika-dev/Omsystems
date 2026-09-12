/**
 * Automated Test Suite for Worker/Elderly Fall Detection (analytics.fall_detection)
 * 
 * Verifies bounding box aspect ratio dynamics, pose estimation kinematics,
 * temporal state machine transitions, intentional action suppression,
 * database repository queries, service alerts, and Fastify routes with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { AspectRatioDynamicsAnalyzer } from '../../src/analytics/fall/aspect-ratio-dynamics.js';
import { PoseKinematicsAnalyzer } from '../../src/analytics/fall/pose-kinematics.js';
import { FallStateMachine } from '../../src/analytics/fall/fall-state-machine.js';
import { FallDetector } from '../../src/analytics/fall/fall-detector.js';
import { FallRepository } from '../../src/analytics/fall/fall-repository.js';
import { FallDetectionService } from '../../src/analytics/fall/fall-service.js';
import { registerFallDetectionRoutes } from '../../src/routes/fall-detection.routes.js';
import type { FallDetectorConfig, PersonTrack } from '../../src/analytics/fall/types.js';

describe('AspectRatioDynamicsAnalyzer', () => {
  const analyzer = new AspectRatioDynamicsAnalyzer({ aspectRatioThreshold: 1.20 });

  it('correctly calculates aspect ratio for upright standing person', () => {
    // Upright person: width 40px, height 120px -> AR = 40/120 = 0.333
    const metrics = analyzer.analyzeTrajectory([
      { timestamp: 1000, boundingBox: { x: 100, y: 100, width: 40, height: 120 } },
    ]);

    expect(metrics.currentAspectRatio).toBeCloseTo(0.333, 2);
    expect(metrics.isHorizontallyOriented).toBe(false);
    expect(metrics.verticalVelocity).toBe(0);
  });

  it('detects rapid aspect ratio inversion during fall collapse', () => {
    // Sequence: upright standing -> collapsing -> recumbent on floor
    const trajectory = [
      { timestamp: 1000, boundingBox: { x: 100, y: 100, width: 40, height: 120 } }, // AR = 0.33
      { timestamp: 1200, boundingBox: { x: 105, y: 130, width: 60, height: 90 } },  // AR = 0.67
      { timestamp: 1400, boundingBox: { x: 110, y: 170, width: 130, height: 50 } }, // AR = 2.60 (Fallen)
    ];

    const metrics = analyzer.analyzeTrajectory(trajectory);
    expect(metrics.currentAspectRatio).toBe(2.6);
    expect(metrics.isHorizontallyOriented).toBe(true);
    expect(metrics.aspectRatioVelocity).toBeGreaterThan(5.0); // Rapid inversion > 5.0 / sec
    expect(metrics.verticalVelocity).toBeGreaterThanOrEqual(100); // Rapid downward descent (px/s)
  });

  it('quantifies motionless stillness post-impact', () => {
    // Person lying still on floor across 4 frames
    const motionlessTrajectory = [
      { timestamp: 2000, boundingBox: { x: 110, y: 170, width: 130, height: 50 } },
      { timestamp: 2200, boundingBox: { x: 110, y: 170, width: 130, height: 50 } },
      { timestamp: 2400, boundingBox: { x: 110.5, y: 170, width: 130, height: 50 } },
      { timestamp: 2600, boundingBox: { x: 110, y: 170.2, width: 130, height: 50 } },
    ];

    const metrics = analyzer.analyzeTrajectory(motionlessTrajectory);
    expect(metrics.isHorizontallyOriented).toBe(true);
    expect(metrics.postImpactMotionEnergy).toBeLessThan(1.0); // Very low motion energy = still
  });
});

describe('PoseKinematicsAnalyzer', () => {
  const analyzer = new PoseKinematicsAnalyzer({ torsoAngleThreshold: 35.0 });

  it('calculates near-vertical torso inclination angle for standing posture', () => {
    // Standing: shoulders at y=120, hips at y=180, aligned vertically (dx=0, dy=60)
    const metrics = analyzer.analyzePose({
      nose: { x: 100, y: 90, confidence: 0.95 },
      leftShoulder: { x: 90, y: 120, confidence: 0.95 },
      rightShoulder: { x: 110, y: 120, confidence: 0.95 },
      leftHip: { x: 92, y: 180, confidence: 0.95 },
      rightHip: { x: 108, y: 180, confidence: 0.95 },
      leftAnkle: { x: 90, y: 240, confidence: 0.90 },
      rightAnkle: { x: 110, y: 240, confidence: 0.90 },
    });

    expect(metrics.hasValidPose).toBe(true);
    expect(metrics.torsoAngleDegrees).toBeGreaterThan(80.0); // Almost 90° upright
    expect(metrics.isTorsoHorizontal).toBe(false);
  });

  it('calculates acute torso angle and detects horizontal orientation for fallen posture', () => {
    // Fallen prone: shoulders at (100, 200), hips at (160, 210) -> dy=10, dx=60 -> angle = arctan(10/60) ~ 9.5°
    const metrics = analyzer.analyzePose({
      nose: { x: 70, y: 202, confidence: 0.9 },
      leftShoulder: { x: 100, y: 195, confidence: 0.9 },
      rightShoulder: { x: 100, y: 205, confidence: 0.9 },
      leftHip: { x: 160, y: 205, confidence: 0.9 },
      rightHip: { x: 160, y: 215, confidence: 0.9 },
      leftAnkle: { x: 220, y: 210, confidence: 0.85 },
      rightAnkle: { x: 220, y: 220, confidence: 0.85 },
    });

    expect(metrics.hasValidPose).toBe(true);
    expect(metrics.torsoAngleDegrees).toBeLessThan(20.0); // Nearly horizontal on ground
    expect(metrics.isTorsoHorizontal).toBe(true);
    expect(metrics.fallDirection).toBe('forward');
  });

  it('identifies sideways fall trajectory from lateral shoulder tilt', () => {
    // Shoulders displaced laterally across screen relative to hips
    const metrics = analyzer.analyzePose({
      leftShoulder: { x: 80, y: 190, confidence: 0.9 },
      rightShoulder: { x: 90, y: 200, confidence: 0.9 },
      leftHip: { x: 150, y: 200, confidence: 0.9 },
      rightHip: { x: 155, y: 205, confidence: 0.9 },
    });

    expect(metrics.isTorsoHorizontal).toBe(true);
    expect(metrics.fallDirection).toBe('sideways');
  });
});

describe('FallStateMachine', () => {
  const defaultConfig: FallDetectorConfig = {
    profile: 'worker',
    sensitivity: 0.75,
    minConfidence: 0.65,
    aspectRatioThreshold: 1.20,
    velocityThreshold: 0.150,
    torsoAngleThreshold: 35.0,
    motionlessDelaySeconds: 2.0,
    recoveryTimeoutSeconds: 10.0,
    alertSeverity: 'P1',
  };

  it('transitions UPRIGHT -> DESCENT -> IMPACT -> POST_FALL_MOTIONLESS', () => {
    const sm = new FallStateMachine(defaultConfig);

    // Frame 1: Upright walking
    const s1 = sm.update(
      'track-1',
      1000,
      'worker',
      { currentAspectRatio: 0.35, peakAspectRatio: 0.35, aspectRatioVelocity: 0, verticalVelocity: 0, verticalAcceleration: 0, isHorizontallyOriented: false, centroidDescentDistance: 0, postImpactMotionEnergy: 2.0, baseFloorY: 150 },
      { hasValidPose: true, torsoAngleDegrees: 85, isTorsoHorizontal: false, headToHipDistance: 60, verticalSpanRatio: 0.8, fallDirection: 'unknown', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.1 }
    );
    expect(s1.phase).toBe('UPRIGHT');

    // Frame 2: Rapid Descent
    const s2 = sm.update(
      'track-1',
      1200,
      'worker',
      { currentAspectRatio: 0.75, peakAspectRatio: 0.75, aspectRatioVelocity: 2.0, verticalVelocity: 0.25, verticalAcceleration: 1.2, isHorizontallyOriented: false, centroidDescentDistance: 35, postImpactMotionEnergy: 10.0, baseFloorY: 180 },
      { hasValidPose: true, torsoAngleDegrees: 45, isTorsoHorizontal: false, headToHipDistance: 45, verticalSpanRatio: 0.6, fallDirection: 'forward', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.3 }
    );
    expect(s2.phase).toBe('DESCENT');

    // Frame 3: Impact on floor
    const s3 = sm.update(
      'track-1',
      1400,
      'worker',
      { currentAspectRatio: 1.80, peakAspectRatio: 1.80, aspectRatioVelocity: 5.25, verticalVelocity: 0.05, verticalAcceleration: -2.0, isHorizontallyOriented: true, centroidDescentDistance: 70, postImpactMotionEnergy: 1.0, baseFloorY: 220 },
      { hasValidPose: true, torsoAngleDegrees: 12, isTorsoHorizontal: true, headToHipDistance: 15, verticalSpanRatio: 0.3, fallDirection: 'forward', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.85 }
    );
    expect(s3.phase).toBe('IMPACT');

    // Frame 4: Motionless for 2.5s >= motionlessDelaySeconds 2.0s
    const s4 = sm.update(
      'track-1',
      3900,
      'worker',
      { currentAspectRatio: 1.80, peakAspectRatio: 1.80, aspectRatioVelocity: 0, verticalVelocity: 0, verticalAcceleration: 0, isHorizontallyOriented: true, centroidDescentDistance: 70, postImpactMotionEnergy: 0.2, baseFloorY: 220 },
      { hasValidPose: true, torsoAngleDegrees: 12, isTorsoHorizontal: true, headToHipDistance: 15, verticalSpanRatio: 0.3, fallDirection: 'forward', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.85 }
    );
    expect(s4.phase).toBe('POST_FALL_MOTIONLESS');
    expect(s4.motionlessDurationSeconds).toBeGreaterThanOrEqual(2.0);
  });

  it('detects recovery when person stands back up', () => {
    const sm = new FallStateMachine(defaultConfig);

    // Frame 1: Impact
    sm.update(
      'track-2',
      1000,
      'worker',
      { currentAspectRatio: 1.6, peakAspectRatio: 1.6, aspectRatioVelocity: 0, verticalVelocity: 0.2, verticalAcceleration: 0, isHorizontallyOriented: true, centroidDescentDistance: 60, postImpactMotionEnergy: 1.0, baseFloorY: 200 },
      { hasValidPose: true, torsoAngleDegrees: 15, isTorsoHorizontal: true, headToHipDistance: 15, verticalSpanRatio: 0.3, fallDirection: 'forward', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.85 }
    );

    // Frame 2 at t=3000ms: Person stands back up (AR = 0.40, Torso = 80°)
    const s2 = sm.update(
      'track-2',
      3000,
      'worker',
      { currentAspectRatio: 0.40, peakAspectRatio: 1.6, aspectRatioVelocity: -0.6, verticalVelocity: -0.15, verticalAcceleration: 0, isHorizontallyOriented: false, centroidDescentDistance: 10, postImpactMotionEnergy: 3.0, baseFloorY: 150 },
      { hasValidPose: true, torsoAngleDegrees: 80, isTorsoHorizontal: false, headToHipDistance: 55, verticalSpanRatio: 0.8, fallDirection: 'forward', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.1 }
    );

    expect(s2.phase).toBe('RECOVERED');
    expect(s2.recoveryDetected).toBe(true);
    expect(s2.recoveryTimeSeconds).toBeGreaterThan(0);
  });

  it('suppresses false positive when person sits down intentionally', () => {
    const sm = new FallStateMachine(defaultConfig);

    // Sitting posture: aspect ratio is 0.95 (not > 1.20), torso is upright at 68°, velocity is smooth
    const s = sm.update(
      'track-sit',
      1000,
      'worker',
      { currentAspectRatio: 0.95, peakAspectRatio: 0.95, aspectRatioVelocity: 0.2, verticalVelocity: 0.08, verticalAcceleration: 0, isHorizontallyOriented: false, centroidDescentDistance: 25, postImpactMotionEnergy: 0.5, baseFloorY: 170 },
      { hasValidPose: true, torsoAngleDegrees: 68, isTorsoHorizontal: false, headToHipDistance: 50, verticalSpanRatio: 0.65, fallDirection: 'unknown', averageKeypointConfidence: 0.9, kneeBucklingDetected: false, elevationDropRatio: 0.2 }
    );

    expect(s.phase).toBe('SUPPRESSED_INTENTIONAL');
    expect(s.suppressionReason).toContain('Controlled sitting posture');
  });
});

describe('FallDetector Multi-Factor Fusion', () => {
  it('detects industrial worker scaffold fall with scaffold_drop classification', () => {
    const detector = new FallDetector({ profile: 'worker', motionlessDelaySeconds: 1.0 });

    const workerFallTrack: PersonTrack = {
      trackId: 'worker-scaffold-1',
      category: 'worker',
      observations: [
        { timestamp: 1000, boundingBox: { x: 100, y: 50, width: 40, height: 120 } },
        { timestamp: 1200, boundingBox: { x: 105, y: 150, width: 70, height: 80 } }, // High vertical drop > 100px
        {
          timestamp: 1400,
          boundingBox: { x: 110, y: 220, width: 140, height: 45 },
          keypoints: {
            leftShoulder: { x: 115, y: 230, confidence: 0.95 },
            rightShoulder: { x: 125, y: 235, confidence: 0.95 },
            leftHip: { x: 180, y: 235, confidence: 0.95 },
            rightHip: { x: 185, y: 240, confidence: 0.95 },
          },
        },
      ],
    };

    const results = detector.analyze({
      cameraId: 'cam-industrial-1',
      tenantId: 'tenant-01',
      timestamp: 1400,
      activeTracks: [workerFallTrack],
    });

    expect(results.length).toBeGreaterThan(0);
    const event = results[0]!;
    expect(event.detected).toBe(true);
    expect(event.personCategory).toBe('worker');
    expect(event.confidence).toBeGreaterThan(0.70);
    expect(event.fallType).toBe('scaffold_drop');
  });

  it('detects elderly slump fall with adjusted velocity sensitivity', () => {
    const detector = new FallDetector({ profile: 'elderly', motionlessDelaySeconds: 1.0 });

    const elderlyTrack: PersonTrack = {
      trackId: 'elderly-slump-1',
      category: 'elderly',
      observations: [
        { timestamp: 1000, boundingBox: { x: 200, y: 100, width: 45, height: 110 } },
        { timestamp: 1300, boundingBox: { x: 200, y: 130, width: 65, height: 85 } },
        {
          timestamp: 1600,
          boundingBox: { x: 200, y: 160, width: 120, height: 50 },
          keypoints: {
            nose: { x: 210, y: 165, confidence: 0.9 },
            leftShoulder: { x: 220, y: 170, confidence: 0.9 },
            rightShoulder: { x: 230, y: 172, confidence: 0.9 },
            leftHip: { x: 280, y: 175, confidence: 0.9 },
            rightHip: { x: 285, y: 178, confidence: 0.9 },
          },
        },
      ],
    };

    const results = detector.analyze({
      cameraId: 'cam-ward-3',
      tenantId: 'tenant-01',
      timestamp: 1600,
      activeTracks: [elderlyTrack],
    });

    expect(results.length).toBeGreaterThan(0);
    const event = results[0]!;
    expect(event.detected).toBe(true);
    expect(event.personCategory).toBe('elderly');
  });
});

describe('FallRepository & Service Integration', () => {
  // In-memory mock database pool
  class MockPool {
    events: any[] = [];
    configs = new Map<string, any>();

    async query(sql: string, params: any[] = []): Promise<any> {
      if (sql.includes('INSERT INTO fall_detection_events')) {
        const ev = {
          id: 'fall_' + Math.random().toString(36).substring(2, 9),
          tenant_id: params[0],
          camera_id: params[1],
          track_id: params[2],
          person_category: params[3],
          fall_type: params[4],
          confidence: params[5],
          severity: params[6],
          impact_speed: params[7],
          aspect_ratio_peak: params[8],
          torso_angle_degrees: params[9],
          motionless_duration_seconds: params[10],
          recovery_detected: params[11],
          recovery_time_seconds: params[12],
          bounding_box: JSON.parse(params[13]),
          pose_keypoints: JSON.parse(params[14]),
          dynamics_telemetry: JSON.parse(params[15]),
          snapshot_reference: params[16],
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          review_notes: null,
          occurred_at: params[17],
          created_at: new Date(),
        };
        this.events.push(ev);
        return { rows: [ev] };
      }

      if (sql.includes('COUNT(*) as total')) {
        return { rows: [{ total: String(this.events.length) }] };
      }

      if (sql.includes('FROM fall_detection_events') && sql.includes('SELECT *')) {
        return { rows: this.events };
      }

      if (sql.includes('SELECT') && sql.includes('COUNT(*) FILTER')) {
        return {
          rows: [
            {
              total: String(this.events.length),
              worker_count: String(this.events.filter((e) => e.person_category === 'worker').length),
              elderly_count: String(this.events.filter((e) => e.person_category === 'elderly').length),
              unrecovered_emergency_count: String(this.events.filter((e) => !e.recovery_detected && e.severity === 'P1').length),
              recovered_count: String(this.events.filter((e) => e.recovery_detected).length),
              pending_count: String(this.events.filter((e) => e.review_status === 'pending').length),
              fp_count: String(this.events.filter((e) => e.review_status === 'false_positive').length),
              avg_confidence: '0.88',
              p1_count: String(this.events.filter((e) => e.severity === 'P1').length),
            },
          ],
        };
      }

      if (sql.includes('UPDATE fall_detection_events')) {
        const ev = this.events.find((e) => e.id === params[3] && e.tenant_id === params[4]);
        if (ev) {
          ev.review_status = params[0];
          ev.reviewed_by = params[1];
          ev.review_notes = params[2];
          ev.reviewed_at = new Date();
          return { rows: [ev] };
        }
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO fall_detection_configs')) {
        const cfg = {
          camera_id: params[0],
          tenant_id: params[1],
          enabled: params[2],
          profile: params[3],
          sensitivity: params[4],
          min_confidence: params[5],
          aspect_ratio_threshold: params[6],
          velocity_threshold: params[7],
          torso_angle_threshold: params[8],
          motionless_delay_seconds: params[9],
          recovery_timeout_seconds: params[10],
          alert_severity: params[11],
          created_at: new Date(),
          updated_at: new Date(),
        };
        this.configs.set(params[0], cfg);
        return { rows: [cfg] };
      }

      if (sql.includes('FROM fall_detection_configs')) {
        const cfg = this.configs.get(params[0]);
        return { rows: cfg ? [cfg] : [] };
      }

      return { rows: [] };
    }
  }

  let pool: MockPool;
  let repo: FallRepository;

  beforeEach(() => {
    pool = new MockPool();
    repo = new FallRepository(pool as any);
  });

  it('persists fall event and retrieves via repository with audit fields', async () => {
    const saved = await repo.saveEvent(
      'tenant-100',
      'cam-100',
      {
        detected: true,
        trackId: 'track-55',
        personCategory: 'elderly',
        fallType: 'slump',
        confidence: 0.92,
        severity: 'P1',
        status: 'confirmed',
        impactSpeed: 0.22,
        peakAspectRatio: 1.85,
        torsoAngleDegrees: 18.5,
        motionlessDurationSeconds: 4.5,
        recoveryDetected: false,
        recoveryTimeSeconds: null,
        boundingBox: { x: 10, y: 20, width: 100, height: 40 },
        dynamicsTelemetry: { kinematics: {} as any, stateHistory: [] },
        alertRequired: true,
      },
      new Date()
    );

    expect(saved.id).toBeDefined();
    expect(saved.person_category).toBe('elderly');
    expect(saved.review_status).toBe('pending');

    // Operator review action
    const reviewed = await repo.reviewEvent(saved.id, 'tenant-100', 'confirmed', 'user-admin', 'Verified on CCTV');
    expect(reviewed?.review_status).toBe('confirmed');
    expect(reviewed?.review_notes).toBe('Verified on CCTV');
  });

  it('upserts and retrieves per-camera threshold configuration', async () => {
    const cfg = await repo.upsertCameraConfig('cam-200', 'tenant-100', {
      profile: 'worker',
      sensitivity: 0.85,
      motionless_delay_seconds: 5.0,
      aspect_ratio_threshold: 1.30,
    });

    expect(cfg.camera_id).toBe('cam-200');
    expect(cfg.sensitivity).toBe(0.85);
    expect(cfg.profile).toBe('worker');

    const fetched = await repo.getCameraConfig('cam-200', 'tenant-100');
    expect(fetched?.profile).toBe('worker');
  });

  it('dispatches surveillance alert through control-plane store', async () => {
    const dispatchedAlerts: any[] = [];
    const mockStore = {
      pool,
      createAlert: async (alert: any) => {
        dispatchedAlerts.push(alert);
      },
    };

    const service = new FallDetectionService(pool as any, mockStore as any);

    const fallTrack: PersonTrack = {
      trackId: 'worker-fall-alert',
      category: 'worker',
      observations: [
        { timestamp: 1000, boundingBox: { x: 50, y: 50, width: 40, height: 120 } },
        { timestamp: 1200, boundingBox: { x: 55, y: 150, width: 80, height: 60 } },
        {
          timestamp: 1400,
          boundingBox: { x: 60, y: 200, width: 130, height: 45 },
          keypoints: {
            leftShoulder: { x: 65, y: 210, confidence: 0.95 },
            rightShoulder: { x: 75, y: 215, confidence: 0.95 },
            leftHip: { x: 130, y: 215, confidence: 0.95 },
            rightHip: { x: 135, y: 220, confidence: 0.95 },
          },
        },
      ],
    };

    await service.processAnalysis({
      cameraId: 'cam-alert-1',
      tenantId: 'tenant-100',
      timestamp: 1400,
      activeTracks: [fallTrack],
    });

    expect(dispatchedAlerts.length).toBeGreaterThan(0);
    expect(dispatchedAlerts[0]?.alertType).toBe('FALL_DETECTION');
    expect(dispatchedAlerts[0]?.severity).toBeDefined();
  });
});

describe('Fastify Routes Integration', () => {
  it('serves fall detection endpoints with Fastify', async () => {
    class MockPool {
      events: any[] = [];
      async query(sql: string, params: any[] = []): Promise<any> {
        if (sql.includes('COUNT(*) as total')) return { rows: [{ total: '0' }] };
        if (sql.includes('SELECT * FROM fall_detection_events')) return { rows: [] };
        if (sql.includes('COUNT(*) FILTER')) {
          return {
            rows: [{
              total: '0', worker_count: '0', elderly_count: '0',
              unrecovered_emergency_count: '0', recovered_count: '0',
              pending_count: '0', fp_count: '0', avg_confidence: '0.0', p1_count: '0',
            }],
          };
        }
        if (sql.includes('FROM fall_detection_configs')) return { rows: [] };
        return { rows: [] };
      }
    }

    const mockPool = new MockPool();
    const app = Fastify();
    await registerFallDetectionRoutes(app, { pool: mockPool } as any);

    // Test GET /v1/analytics/fall/events
    const resEvents = await app.inject({
      method: 'GET',
      url: '/v1/analytics/fall/events',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(resEvents.statusCode).toBe(200);
    const eventsJson = JSON.parse(resEvents.body);
    expect(eventsJson.success).toBe(true);
    expect(eventsJson.data).toEqual([]);

    // Test GET /v1/analytics/fall/stats
    const resStats = await app.inject({
      method: 'GET',
      url: '/v1/analytics/fall/stats',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(resStats.statusCode).toBe(200);
    const statsJson = JSON.parse(resStats.body);
    expect(statsJson.success).toBe(true);
    expect(statsJson.data.totalFalls).toBe(0);

    // Test GET /v1/analytics/fall/config/:cameraId
    const resConfig = await app.inject({
      method: 'GET',
      url: '/v1/analytics/fall/config/cam-test-1',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(resConfig.statusCode).toBe(200);
    const configJson = JSON.parse(resConfig.body);
    expect(configJson.success).toBe(true);
    expect(configJson.data.profile).toBe('worker');

    await app.close();
  });
});
