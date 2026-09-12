/**
 * Automated Test Suite for Physical Violence & Fight Detection (analytics.violence)
 * 
 * Verifies real Lucas-Kanade optical flow, directional turbulence entropy,
 * limb kinematic acceleration/jerk, multi-person combat fusion,
 * and repository audit operations with zero mock data in production paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpticalFlowAnalyzer } from '../../src/analytics/violence/optical-flow.js';
import { LimbAccelerationAnalyzer } from '../../src/analytics/violence/limb-acceleration.js';
import { ViolenceDetector, type PersonDetectionTrack } from '../../src/analytics/violence/violence-detector.js';
import { ViolenceRepository } from '../../src/analytics/violence/violence-repository.js';
import { ViolenceDetectionService } from '../../src/analytics/violence/violence-service.js';

describe('OpticalFlowAnalyzer', () => {
  const analyzer = new OpticalFlowAnalyzer({ blockSize: 8, minGradientThreshold: 1.0 });

  it('converts RGB to single-channel ITU-R 601 luminance accurately', () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]); // Pure Red, Green, Blue
    const luma = OpticalFlowAnalyzer.rgbToLuma(rgb, 3, 1, 3);
    expect(luma[0]).toBe(76); // 0.299 * 255 = 76
    expect(luma[1]).toBe(150); // 0.587 * 255 = 150
    expect(luma[2]).toBe(29); // 0.114 * 255 = 29
  });

  it('detects coherent laminar motion with low directional turbulence', () => {
    const width = 64;
    const height = 64;
    const prev = new Uint8Array(width * height);
    const curr = new Uint8Array(width * height);

    // Create high-contrast diagonal texture pattern (providing gradients in both x and y)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev[y * width + x] = ((x + y) % 8 < 4) ? 210 : 40;
      }
    }

    // Shift horizontally by 2 pixels (unidirectional laminar rightward translation)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        curr[y * width + x] = (((x - 2 + width) + y) % 8 < 4) ? 210 : 40;
      }
    }

    const vectors = analyzer.computeFlow(prev, curr, width, height);
    expect(vectors.length).toBeGreaterThan(0);

    const metrics = analyzer.analyzeMetrics(vectors);
    expect(metrics.kineticEnergy).toBeGreaterThan(0);
    // Unidirectional laminar motion should have low angular entropy / turbulence
    expect(metrics.turbulenceScore).toBeLessThan(0.40);
  });

  it('detects chaotic opposing motion with high directional turbulence entropy', () => {
    // Generate synthetic vectors pointing in conflicting, opposing directions (characteristic of a brawl/grappling)
    const chaoticVectors = [
      { x: 10, y: 10, u: 15, v: 0, magnitude: 15, angle: 0 },
      { x: 20, y: 10, u: -14, v: 2, magnitude: 14.1, angle: Math.PI },
      { x: 10, y: 20, u: 0, v: 16, magnitude: 16, angle: Math.PI / 2 },
      { x: 20, y: 20, u: 2, v: -15, magnitude: 15.1, angle: -Math.PI / 2 },
      { x: 15, y: 15, u: 10, v: 10, magnitude: 14.1, angle: Math.PI / 4 },
      { x: 15, y: 25, u: -10, v: -10, magnitude: 14.1, angle: -3 * Math.PI / 4 },
      { x: 25, y: 15, u: -12, v: 12, magnitude: 17.0, angle: 3 * Math.PI / 4 },
      { x: 25, y: 25, u: 12, v: -12, magnitude: 17.0, angle: -Math.PI / 4 },
    ];

    const metrics = analyzer.analyzeMetrics(chaoticVectors);
    expect(metrics.kineticEnergy).toBeGreaterThan(50);
    // Opposing multi-directional vectors yield high angular Shannon entropy
    expect(metrics.turbulenceScore).toBeGreaterThan(0.60);
    expect(metrics.chaoticVectorCount).toBeGreaterThan(2);
  });
});

describe('LimbAccelerationAnalyzer', () => {
  const analyzer = new LimbAccelerationAnalyzer({ strikeAccelThreshold: 30.0 });

  it('reports zero strikes and low acceleration for steady walking motion', () => {
    const walkHistory = [
      { timestamp: 1000, boundingBox: { x: 100, y: 100, width: 40, height: 120 } },
      { timestamp: 1100, boundingBox: { x: 102, y: 100, width: 40, height: 120 } },
      { timestamp: 1200, boundingBox: { x: 104, y: 100, width: 40, height: 120 } },
      { timestamp: 1300, boundingBox: { x: 106, y: 100, width: 40, height: 120 } },
    ];

    const summary = analyzer.analyzeTrajectory('track-walk-1', walkHistory);
    expect(summary.detectedStrikes).toHaveLength(0);
    expect(summary.peakAcceleration).toBeLessThan(10.0);
    expect(summary.erraticMotionScore).toBeLessThan(0.30);
  });

  it('detects ballistic strike and rapid acceleration spike from keypoint movement', () => {
    // Rapid forward punch: wrist moves 25px in 40ms, followed by rapid deceleration
    const punchHistory = [
      {
        timestamp: 1000,
        boundingBox: { x: 100, y: 100, width: 50, height: 140 },
        keypoints: { rightWrist: { x: 120, y: 140, confidence: 0.95 } },
      },
      {
        timestamp: 1040,
        boundingBox: { x: 100, y: 100, width: 50, height: 140 },
        keypoints: { rightWrist: { x: 145, y: 138, confidence: 0.95 } }, // v = (145-120)/0.04 = 625 px/s
      },
      {
        timestamp: 1080,
        boundingBox: { x: 100, y: 100, width: 50, height: 140 },
        keypoints: { rightWrist: { x: 150, y: 138, confidence: 0.95 } }, // deceleration spike
      },
    ];

    const summary = analyzer.analyzeTrajectory('track-punch-1', punchHistory);
    expect(summary.peakAcceleration).toBeGreaterThan(40.0);
    expect(summary.detectedStrikes.length).toBeGreaterThan(0);
    expect(summary.detectedStrikes[0]?.limb).toBe('rightWrist');
    expect(summary.erraticMotionScore).toBeGreaterThan(0.50);
  });
});

describe('ViolenceDetector Core Fusion Engine', () => {
  let detector: ViolenceDetector;

  beforeEach(() => {
    detector = new ViolenceDetector({
      sensitivity: 0.75,
      minConfidence: 0.60,
      minOpticalFlowEnergy: 20.0,
      minLimbAcceleration: 25.0,
      minDurationMs: 300,
      cooldownSeconds: 5,
    });
  });

  it('returns no detection if fewer than 2 persons are visible', () => {
    const singlePersonTrack: PersonDetectionTrack[] = [
      {
        trackId: 'p1',
        observations: [
          { timestamp: 1000, boundingBox: { x: 50, y: 50, width: 40, height: 100 } },
          { timestamp: 1100, boundingBox: { x: 55, y: 50, width: 40, height: 100 } },
        ],
      },
    ];

    const result = detector.analyze({
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: 1100,
      activeTracks: singlePersonTrack,
    });

    expect(result.detected).toBe(false);
    expect(result.status).toBe('none');
    expect(result.confidence).toBe(0);
  });

  it('returns no detection when two people walk past each other peacefully at normal distance', () => {
    const peacefulTracks: PersonDetectionTrack[] = [
      {
        trackId: 'p1',
        observations: [
          { timestamp: 1000, boundingBox: { x: 50, y: 50, width: 40, height: 100 } },
          { timestamp: 1100, boundingBox: { x: 55, y: 50, width: 40, height: 100 } },
        ],
      },
      {
        trackId: 'p2',
        observations: [
          { timestamp: 1000, boundingBox: { x: 300, y: 50, width: 40, height: 100 } }, // Far apart (> 2x height)
          { timestamp: 1100, boundingBox: { x: 295, y: 50, width: 40, height: 100 } },
        ],
      },
    ];

    const result = detector.analyze({
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: 1100,
      activeTracks: peacefulTracks,
    });

    expect(result.detected).toBe(false);
    expect(result.status).toBe('none');
  });

  it('detects and confirms physical altercation with sustained turbulence and limb strikes', () => {
    // Two people in close proximity grappling and throwing ballistic strikes
    const combatTracksT1: PersonDetectionTrack[] = [
      {
        trackId: 'fighter-1',
        observations: [
          {
            timestamp: 1000,
            boundingBox: { x: 100, y: 100, width: 50, height: 120 },
            keypoints: { rightWrist: { x: 120, y: 130, confidence: 0.9 } },
          },
          {
            timestamp: 1050,
            boundingBox: { x: 105, y: 102, width: 50, height: 120 },
            keypoints: { rightWrist: { x: 145, y: 132, confidence: 0.9 } }, // Strike punch
          },
          {
            timestamp: 1100,
            boundingBox: { x: 102, y: 104, width: 50, height: 120 },
            keypoints: { rightWrist: { x: 150, y: 135, confidence: 0.9 } },
          },
        ],
      },
      {
        trackId: 'fighter-2',
        observations: [
          {
            timestamp: 1000,
            boundingBox: { x: 130, y: 100, width: 50, height: 120 }, // Close proximity (< 0.5x height)
            keypoints: { leftWrist: { x: 140, y: 135, confidence: 0.9 } },
          },
          {
            timestamp: 1050,
            boundingBox: { x: 132, y: 98, width: 50, height: 120 },
            keypoints: { leftWrist: { x: 120, y: 130, confidence: 0.9 } }, // Counter punch
          },
          {
            timestamp: 1100,
            boundingBox: { x: 135, y: 101, width: 50, height: 120 },
            keypoints: { leftWrist: { x: 115, y: 130, confidence: 0.9 } },
          },
        ],
      },
    ];

    // High turbulence optical flow vectors in interaction zone
    const precomputedFlow = [
      { x: 115, y: 110, u: 20, v: -5, magnitude: 20.6, angle: -0.24 },
      { x: 125, y: 115, u: -18, v: 8, magnitude: 19.7, angle: 2.72 },
      { x: 120, y: 125, u: 5, v: 22, magnitude: 22.5, angle: 1.34 },
      { x: 130, y: 120, u: -15, v: -15, magnitude: 21.2, angle: -2.35 },
    ];

    // Frame 1 at t=1100ms: should trigger SUSPECTED (first detected encounter)
    const result1 = detector.analyze({
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: 1100,
      activeTracks: combatTracksT1,
      precomputedFlowVectors: precomputedFlow,
    });

    expect(result1.detected).toBe(true);
    expect(result1.status).toBe('suspected');
    expect(result1.confidence).toBeGreaterThan(0.60);
    expect(result1.participantCount).toBe(2);
    expect(result1.participantTrackIds).toContain('fighter-1');
    expect(result1.participantTrackIds).toContain('fighter-2');

    // Frame 2 at t=1500ms (duration 400ms >= minDurationMs 300ms): should advance to CONFIRMED and trigger ALERT
    const combatTracksT2 = combatTracksT1.map((t) => ({
      ...t,
      observations: [
        ...t.observations,
        {
          timestamp: 1500,
          boundingBox: { ...t.observations[t.observations.length - 1]!.boundingBox, x: t.observations[t.observations.length - 1]!.boundingBox.x + 2 },
          keypoints: t.observations[t.observations.length - 1]!.keypoints,
        },
      ],
    }));

    const result2 = detector.analyze({
      cameraId: 'cam-01',
      tenantId: 'tenant-01',
      timestamp: 1500,
      activeTracks: combatTracksT2,
      precomputedFlowVectors: precomputedFlow,
    });

    expect(result2.detected).toBe(true);
    expect(result2.status).toBe('confirmed');
    expect(result2.alertRequired).toBe(true);
    expect(result2.severity).toBe('P1');
  });
});

describe('ViolenceRepository & Service Integration', () => {
  // In-Memory Database Pool Mock for isolated unit testing
  class MockPool {
    events: any[] = [];
    configs = new Map<string, any>();

    async query(sql: string, params: any[] = []): Promise<any> {
      if (sql.includes('INSERT INTO violence_detection_events')) {
        const event = {
          id: 'ev_' + Math.random().toString(36).substring(2, 9),
          tenant_id: params[0],
          camera_id: params[1],
          confidence: params[2],
          severity: params[3],
          optical_flow_energy: params[4],
          turbulence_score: params[5],
          max_limb_acceleration: params[6],
          strike_count: params[7],
          participant_count: params[8],
          participant_track_ids: params[9],
          interaction_box: JSON.parse(params[10]),
          metrics: JSON.parse(params[11]),
          snapshot_reference: params[12],
          review_status: 'pending',
          occurred_at: params[13],
          created_at: new Date(),
        };
        this.events.push(event);
        return { rows: [event] };
      }

      if (sql.includes('COUNT(*) as total')) {
        return { rows: [{ total: String(this.events.length) }] };
      }

      if (sql.includes('FROM violence_detection_events e')) {
        return { rows: [...this.events] };
      }

      if (sql.includes('WHERE e.id = $1 AND e.tenant_id = $2')) {
        const found = this.events.find((e) => e.id === params[0] && e.tenant_id === params[1]);
        return { rows: found ? [found] : [] };
      }

      if (sql.includes('UPDATE violence_detection_events')) {
        const found = this.events.find((e) => e.id === params[3] && e.tenant_id === params[4]);
        if (found) {
          found.review_status = params[0];
          found.reviewed_by = params[1];
          found.review_notes = params[2];
          found.reviewed_at = new Date();
        }
        return { rows: found ? [found] : [] };
      }

      if (sql.includes('INSERT INTO violence_detection_configs')) {
        const config = {
          camera_id: params[0],
          tenant_id: params[1],
          enabled: params[2],
          sensitivity: params[3],
          min_confidence: params[4],
          min_optical_flow_energy: params[5],
          min_limb_acceleration: params[6],
          min_duration_ms: params[7],
          cooldown_seconds: params[8],
          alert_severity: params[9],
          created_at: new Date(),
          updated_at: new Date(),
        };
        this.configs.set(params[0], config);
        return { rows: [config] };
      }

      if (sql.includes('FROM violence_detection_configs')) {
        const c = this.configs.get(params[0]);
        return { rows: c ? [c] : [] };
      }

      if (sql.includes('COUNT(*) FILTER (WHERE review_status = \'pending\')')) {
        return {
          rows: [
            {
              total: String(this.events.length),
              pending: String(this.events.filter((e) => e.review_status === 'pending').length),
              confirmed: String(this.events.filter((e) => e.review_status === 'confirmed').length),
              false_positive: String(this.events.filter((e) => e.review_status === 'false_positive').length),
              escalated: String(this.events.filter((e) => e.review_status === 'escalated').length),
              avg_confidence: '0.85',
              p1_count: String(this.events.filter((e) => e.severity === 'P1').length),
            },
          ],
        };
      }

      return { rows: [] };
    }
  }

  let mockPool: any;
  let repository: ViolenceRepository;
  let service: ViolenceDetectionService;

  beforeEach(() => {
    mockPool = new MockPool();
    repository = new ViolenceRepository(mockPool);
    service = new ViolenceDetectionService(mockPool);
  });

  it('saves and retrieves violent encounter incident records', async () => {
    const saved = await repository.saveEvent(
      'tenant-100',
      'cam-200',
      {
        detected: true,
        confidence: 0.88,
        severity: 'P1',
        status: 'confirmed',
        opticalFlowEnergy: 45.2,
        turbulenceScore: 0.74,
        maxLimbAcceleration: 48.6,
        strikeCount: 2,
        participantCount: 2,
        participantTrackIds: ['t1', 't2'],
        interactionBox: { x: 10, y: 20, width: 100, height: 120 },
        metrics: {
          proximityScore: 0.85,
          flowKineticScore: 0.75,
          turbulenceScore: 0.74,
          limbStrikeScore: 0.80,
          temporalDurationMs: 650,
          detectedStrikes: [],
        },
        alertRequired: true,
      },
      new Date('2026-09-12T00:00:00Z'),
      'snap-001.jpg'
    );

    expect(saved.id).toBeDefined();
    expect(saved.confidence).toBe(0.88);
    expect(saved.severity).toBe('P1');
    expect(saved.optical_flow_energy).toBe(45.2);
    expect(saved.review_status).toBe('pending');

    const listed = await repository.listEvents({ tenantId: 'tenant-100' });
    expect(listed.total).toBe(1);
    expect(listed.events[0]?.id).toBe(saved.id);
  });

  it('updates human-in-the-loop review status on an incident', async () => {
    const saved = await repository.saveEvent(
      'tenant-100',
      'cam-200',
      {
        detected: true,
        confidence: 0.85,
        severity: 'P1',
        status: 'confirmed',
        opticalFlowEnergy: 35.0,
        turbulenceScore: 0.65,
        maxLimbAcceleration: 38.0,
        strikeCount: 1,
        participantCount: 2,
        participantTrackIds: ['p1', 'p2'],
        interactionBox: null,
        metrics: {} as any,
        alertRequired: true,
      },
      new Date()
    );

    const reviewed = await service.reviewEvent(
      saved.id,
      'tenant-100',
      'confirmed',
      'usr-guard-99',
      'Physical assault confirmed on main concourse; security dispatched'
    );

    expect(reviewed).toBeDefined();
    expect(reviewed?.review_status).toBe('confirmed');
    expect(reviewed?.reviewed_by).toBe('usr-guard-99');
    expect(reviewed?.review_notes).toContain('security dispatched');
  });

  it('upserts and retrieves per-camera sensitivity thresholds', async () => {
    const config = await repository.upsertCameraConfig('cam-atm-01', 'tenant-100', {
      sensitivity: 0.85,
      minOpticalFlowEnergy: 18.0,
      minLimbAcceleration: 22.0,
      alert_severity: 'P1',
    });

    expect(config.camera_id).toBe('cam-atm-01');
    expect(config.sensitivity).toBe(0.85);

    const fetched = await service.getCameraConfig('cam-atm-01', 'tenant-100');
    expect(fetched?.min_optical_flow_energy).toBe(18.0);
  });
});

describe('Violence Detection Fastify Routes Integration', () => {
  it('serves violence detection endpoints with Fastify', async () => {
    const Fastify = (await import('fastify')).default;
    const { registerViolenceDetectionRoutes } = await import('../../src/routes/violence-detection.routes.js');

    const app = Fastify();
    const mockStore: any = {
      pool: {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('COUNT(*) FILTER')) {
            return {
              rows: [
                {
                  total: '1',
                  pending: '1',
                  confirmed: '0',
                  false_positive: '0',
                  escalated: '0',
                  avg_confidence: '0.92',
                  p1_count: '1',
                },
              ],
            };
          }
          if (sql.includes('COUNT(*) as total')) {
            return { rows: [{ total: '1' }] };
          }
          if (sql.includes('FROM violence_detection_events')) {
            return {
              rows: [
                {
                  id: 'ev-test-123',
                  tenant_id: 'tenant-001',
                  camera_id: '00000000-0000-0000-0000-000000000001',
                  confidence: 0.92,
                  severity: 'P1',
                  optical_flow_energy: 40.5,
                  turbulence_score: 0.72,
                  max_limb_acceleration: 52.1,
                  strike_count: 2,
                  participant_count: 2,
                  participant_track_ids: ['t1', 't2'],
                  interaction_box: {},
                  metrics: {},
                  review_status: 'pending',
                  occurred_at: new Date(),
                  created_at: new Date(),
                },
              ],
            };
          }
          return { rows: [] };
        },
      },
    };

    await registerViolenceDetectionRoutes(app, mockStore);
    await app.ready();

    // Test GET /v1/analytics/violence/events
    const resEvents = await app.inject({
      method: 'GET',
      url: '/v1/analytics/violence/events',
      headers: { 'x-tenant-id': 'tenant-001' },
    });
    expect(resEvents.statusCode).toBe(200);
    const bodyEvents = JSON.parse(resEvents.body);
    expect(bodyEvents.success).toBe(true);
    expect(bodyEvents.data).toHaveLength(1);
    expect(bodyEvents.data[0].id).toBe('ev-test-123');

    // Test GET /v1/analytics/violence/stats
    const resStats = await app.inject({
      method: 'GET',
      url: '/v1/analytics/violence/stats',
      headers: { 'x-tenant-id': 'tenant-001' },
    });
    expect(resStats.statusCode).toBe(200);
    const bodyStats = JSON.parse(resStats.body);
    expect(bodyStats.success).toBe(true);
    expect(bodyStats.data.totalIncidents).toBe(1);

    await app.close();
  });
});
