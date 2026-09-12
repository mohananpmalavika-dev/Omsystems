/**
 * Automated Test Suite for Multi-Camera Person Re-Identification (analytics.re_identification)
 * 
 * Verifies mathematical 512-d L2 vector normalization, cosine distance invariants,
 * visual quality evaluation, tracklet QWAP pooling, EMA gallery updates,
 * multi-camera spatio-temporal transit constraints, cross-camera trajectory reconstruction,
 * and Fastify REST API integration with zero mock data in algorithmic paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ReidFeatureExtractor,
  REID_EMBEDDING_DIMENSION,
} from '../../src/analytics/reid/reid-feature-extractor.js';
import {
  ReidTopologyValidator,
} from '../../src/analytics/reid/reid-topology.js';
import {
  ReidRepository,
} from '../../src/analytics/reid/reid-repository.js';
import {
  ReidService,
} from '../../src/analytics/reid/reid-service.js';
import { registerReIdRoutes } from '../../src/routes/reid.routes.js';

// Helper to generate deterministic unit vectors
function makeSyntheticUnitVector(seed: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < REID_EMBEDDING_DIMENSION; i++) {
    vec.push(Math.sin(seed * (i + 1)) + Math.cos(seed * (i + 3)));
  }
  return ReidFeatureExtractor.normalizeL2(vec);
}

describe('ReidFeatureExtractor & Mathematical Vector Contracts', () => {
  const extractor = new ReidFeatureExtractor();

  it('normalizes arbitrary 512-d vectors to exact Euclidean unit length', () => {
    const raw = new Array(REID_EMBEDDING_DIMENSION).fill(0).map((_, i) => (i % 7) - 3);
    const normalized = ReidFeatureExtractor.normalizeL2(raw);

    expect(normalized).toHaveLength(REID_EMBEDDING_DIMENSION);
    const norm = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('rejects vectors with incorrect dimensionality', () => {
    expect(() => ReidFeatureExtractor.normalizeL2([0.1, 0.2, 0.3])).toThrow(
      'must have exactly 512 finite dimensions'
    );
  });

  it('rejects non-finite vector entries', () => {
    const badVec = new Array(REID_EMBEDDING_DIMENSION).fill(1.0);
    badVec[10] = NaN;
    expect(() => ReidFeatureExtractor.normalizeL2(badVec)).toThrow('non-finite');
  });

  it('rejects degenerate zero-vectors', () => {
    const zeroVec = new Array(REID_EMBEDDING_DIMENSION).fill(0.0);
    expect(() => ReidFeatureExtractor.normalizeL2(zeroVec)).toThrow('zero-vector');
  });

  it('computes exact 1.0 cosine similarity for identical unit vectors', () => {
    const vec = makeSyntheticUnitVector(0.42);
    const sim = ReidFeatureExtractor.cosineSimilarity(vec, vec);
    expect(sim).toBeCloseTo(1.0, 5);

    const dist = ReidFeatureExtractor.cosineDistance(vec, vec);
    expect(dist).toBeCloseTo(0.0, 5);
  });

  it('computes 0.0 cosine similarity for orthogonal vector halves', () => {
    const vecA = new Array(REID_EMBEDDING_DIMENSION).fill(0);
    const vecB = new Array(REID_EMBEDDING_DIMENSION).fill(0);

    for (let i = 0; i < 256; i++) vecA[i] = 1 / Math.sqrt(256);
    for (let i = 256; i < 512; i++) vecB[i] = 1 / Math.sqrt(256);

    const sim = ReidFeatureExtractor.cosineSimilarity(vecA, vecB);
    expect(sim).toBe(0.0);

    const dist = ReidFeatureExtractor.cosineDistance(vecA, vecB);
    expect(dist).toBe(1.0);
  });

  it('evaluates visual quality and rejects under-resolution crops', () => {
    // Valid standard standing person: 150px height x 50px width (aspect ratio 3.0)
    const validQuality = extractor.evaluateQuality(
      { x: 100, y: 100, width: 50, height: 150 },
      0.92,
      0.80
    );
    expect(validQuality.isAcceptable).toBe(true);
    expect(validQuality.overallQuality).toBeGreaterThan(0.65);
    expect(validQuality.aspectRatio).toBeCloseTo(3.0, 2);

    // Tiny crop: below minimum dimensions (15px width, 40px height)
    const tinyQuality = extractor.evaluateQuality(
      { x: 100, y: 100, width: 15, height: 40 },
      0.80
    );
    expect(tinyQuality.isAcceptable).toBe(false);
    expect(tinyQuality.rejectionReason).toContain('below minimum');
  });

  it('aggregates tracklet frames with Quality-Weighted Average Pooling (QWAP)', () => {
    const vecGood = makeSyntheticUnitVector(0.1);
    const vecMedium = makeSyntheticUnitVector(0.15);
    const vecBad = makeSyntheticUnitVector(0.9);

    const samples = [
      {
        embedding: vecGood,
        confidence: 0.95,
        quality: {
          confidence: 0.95,
          aspectRatio: 2.8,
          resolutionScore: 1.0,
          sharpnessScore: 0.9,
          overallQuality: 0.92,
          isAcceptable: true,
        },
        timestamp: 1000,
      },
      {
        embedding: vecMedium,
        confidence: 0.85,
        quality: {
          confidence: 0.85,
          aspectRatio: 2.7,
          resolutionScore: 0.8,
          sharpnessScore: 0.8,
          overallQuality: 0.80,
          isAcceptable: true,
        },
        timestamp: 1100,
      },
      {
        embedding: vecBad,
        confidence: 0.40,
        quality: {
          confidence: 0.40,
          aspectRatio: 1.0,
          resolutionScore: 0.2,
          sharpnessScore: 0.3,
          overallQuality: 0.25,
          isAcceptable: false,
          rejectionReason: 'Blurred crop',
        },
        timestamp: 1200,
      },
    ];

    const aggregated = extractor.aggregateTracklet(samples);
    expect(aggregated.sampleCount).toBe(2);
    expect(aggregated.rejectedSampleCount).toBe(1);
    expect(aggregated.representativeEmbedding).toHaveLength(REID_EMBEDDING_DIMENSION);

    // Output is unit length
    const norm = Math.sqrt(
      aggregated.representativeEmbedding.reduce((acc, v) => acc + v * v, 0)
    );
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('updates gallery identity via Exponential Moving Average (EMA)', () => {
    const galleryVec = makeSyntheticUnitVector(0.3);
    const newTrackletVec = makeSyntheticUnitVector(0.35);

    const updated = ReidFeatureExtractor.updateGalleryEmbedding(galleryVec, newTrackletVec, 0.85);
    expect(updated).toHaveLength(REID_EMBEDDING_DIMENSION);

    const norm = Math.sqrt(updated.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);

    // High similarity to prior gallery identity
    const simToPrior = ReidFeatureExtractor.cosineSimilarity(galleryVec, updated);
    expect(simToPrior).toBeGreaterThan(0.95);
  });

  it('extracts deterministic 512-d unit vector from raw RGB pixel buffer', () => {
    const width = 24;
    const height = 48;
    const rgb = new Uint8Array(width * height * 3);

    // Synthetic upper body blue, lower body dark
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        if (y < height * 0.2) {
          // Head (skin tone)
          rgb[idx] = 220;
          rgb[idx + 1] = 180;
          rgb[idx + 2] = 140;
        } else if (y < height * 0.6) {
          // Torso (blue shirt)
          rgb[idx] = 30;
          rgb[idx + 1] = 90;
          rgb[idx + 2] = 200;
        } else {
          // Legs (dark pants)
          rgb[idx] = 40;
          rgb[idx + 1] = 40;
          rgb[idx + 2] = 45;
        }
      }
    }

    const embedding = extractor.extractFromRgbBuffer(rgb, width, height, 3);
    expect(embedding).toHaveLength(REID_EMBEDDING_DIMENSION);

    const norm = Math.sqrt(embedding.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });
});

describe('ReidTopologyValidator & Spatio-Temporal Transit Engine', () => {
  const validator = new ReidTopologyValidator({
    defaultMinTransitSeconds: 3,
    defaultMaxTransitSeconds: 180,
    maxPhysicalVelocityMps: 5.0,
  });

  beforeEach(() => {
    validator.clearEdges();
    // Configure calibrated branch camera edge: Entrance -> Lobby (distance 20m, min 4s, max 90s)
    validator.addEdge({
      fromCameraId: 'cam-entrance',
      toCameraId: 'cam-lobby',
      minTransitSeconds: 4,
      maxTransitSeconds: 90,
      distanceMeters: 20,
      transitionProbability: 0.95,
      enabled: true,
    });
  });

  it('validates plausible transit between cameras within time window', () => {
    const prior = {
      cameraId: 'cam-entrance',
      exitedAt: new Date('2026-09-12T10:00:00.000Z'),
      globalId: 'PERSON_101',
    };
    const currentEnteredAt = new Date('2026-09-12T10:00:15.000Z'); // 15 seconds transit

    const res = validator.validateTransition(prior, 'cam-lobby', currentEnteredAt);
    expect(res.isFeasible).toBe(true);
    expect(res.transitDurationSeconds).toBe(15);
    expect(res.estimatedVelocityMps).toBeCloseTo(20 / 15, 2); // ~1.33 m/s (normal walking pace)
    expect(res.temporalScore).toBeGreaterThan(0.8);
  });

  it('rejects causal time inversion where new sighting precedes prior exit', () => {
    const prior = {
      cameraId: 'cam-entrance',
      exitedAt: new Date('2026-09-12T10:00:30.000Z'),
      globalId: 'PERSON_101',
    };
    const currentEnteredAt = new Date('2026-09-12T10:00:10.000Z'); // 20s in the past

    const res = validator.validateTransition(prior, 'cam-lobby', currentEnteredAt);
    expect(res.isFeasible).toBe(false);
    expect(res.reason).toContain('Causal inversion');
  });

  it('rejects physically impossible teleportation below min transit time', () => {
    const prior = {
      cameraId: 'cam-entrance',
      exitedAt: new Date('2026-09-12T10:00:00.000Z'),
      globalId: 'PERSON_101',
    };
    const currentEnteredAt = new Date('2026-09-12T10:00:01.000Z'); // 1 second transit (min required is 4s)

    const res = validator.validateTransition(prior, 'cam-lobby', currentEnteredAt);
    expect(res.isFeasible).toBe(false);
    expect(res.reason).toContain('Impossible travel time');
  });

  it('allows same-camera continuous tracking and re-entry', () => {
    const prior = {
      cameraId: 'cam-entrance',
      exitedAt: new Date('2026-09-12T10:00:00.000Z'),
      globalId: 'PERSON_101',
    };
    const currentEnteredAt = new Date('2026-09-12T10:00:05.000Z');

    const res = validator.validateTransition(prior, 'cam-entrance', currentEnteredAt);
    expect(res.isFeasible).toBe(true);
    expect(res.isSameCamera).toBe(true);
  });
});

describe('ReidService Multi-Camera Trajectory & Journey Integration', () => {
  let service: ReidService;
  const tenantId = 'tenant-reid-001';
  const branchId = 'branch-main-hq';

  beforeEach(() => {
    service = new ReidService(); // In-memory store
  });

  it('tracks a person moving across 3 branch cameras and reconstructs full journey', async () => {
    // Subject visual feature vector
    const personFeature = makeSyntheticUnitVector(0.77);

    // 1. First appearance on Camera 1 (Entrance) at 10:00:00
    const sighting1 = await service.ingestSighting({
      tenantId,
      branchId,
      cameraId: 'cam-1-entrance',
      localTrackId: 'track-cam1-01',
      enteredAt: '2026-09-12T10:00:00.000Z',
      exitedAt: '2026-09-12T10:00:20.000Z', // 20s dwell
      embedding: personFeature,
      confidence: 0.94,
      boundingBox: { x: 50, y: 50, width: 60, height: 160 },
    });

    expect(sighting1.isNewIdentity).toBe(true);
    expect(sighting1.globalId).toMatch(/^PERSON_/);
    const globalId = sighting1.globalId;

    // 2. Second appearance on Camera 2 (Banking Lobby) at 10:00:35 (15s transit from Cam 1)
    // Add slight natural visual noise (0.95 similarity)
    const slightlyShiftedFeature = makeSyntheticUnitVector(0.7705);
    const sighting2 = await service.ingestSighting({
      tenantId,
      branchId,
      cameraId: 'cam-2-lobby',
      localTrackId: 'track-cam2-88',
      enteredAt: '2026-09-12T10:00:35.000Z',
      exitedAt: '2026-09-12T10:01:10.000Z', // 35s dwell
      embedding: slightlyShiftedFeature,
      confidence: 0.91,
      boundingBox: { x: 120, y: 80, width: 55, height: 150 },
    });

    expect(sighting2.matched).toBe(true);
    expect(sighting2.globalId).toBe(globalId);
    expect(sighting2.isCrossCameraTransition).toBe(true);
    expect(sighting2.previousCameraId).toBe('cam-1-entrance');
    expect(sighting2.transitDurationSeconds).toBe(15);

    // 3. Third appearance on Camera 3 (Cash Counters) at 10:01:25 (15s transit from Cam 2)
    const sighting3 = await service.ingestSighting({
      tenantId,
      branchId,
      cameraId: 'cam-3-counters',
      localTrackId: 'track-cam3-12',
      enteredAt: '2026-09-12T10:01:25.000Z',
      exitedAt: '2026-09-12T10:02:40.000Z', // 75s dwell
      embedding: personFeature,
      confidence: 0.96,
      boundingBox: { x: 200, y: 100, width: 65, height: 170 },
    });

    expect(sighting3.matched).toBe(true);
    expect(sighting3.globalId).toBe(globalId);
    expect(sighting3.isCrossCameraTransition).toBe(true);
    expect(sighting3.previousCameraId).toBe('cam-2-lobby');

    // 4. Ingest an orthogonal distinct person
    const distinctPersonFeature = makeSyntheticUnitVector(0.12);
    const distinctSighting = await service.ingestSighting({
      tenantId,
      branchId,
      cameraId: 'cam-1-entrance',
      localTrackId: 'track-cam1-02',
      enteredAt: '2026-09-12T10:02:00.000Z',
      exitedAt: '2026-09-12T10:02:15.000Z',
      embedding: distinctPersonFeature,
      confidence: 0.90,
      boundingBox: { x: 80, y: 70, width: 50, height: 140 },
    });

    expect(distinctSighting.isNewIdentity).toBe(true);
    expect(distinctSighting.globalId).not.toBe(globalId);

    // 5. Verify reconstructed person journey for the first subject
    const journey = await service.getPersonJourney(globalId, tenantId);
    expect(journey).not.toBeNull();
    expect(journey!.totalSightings).toBe(3);
    expect(journey!.uniqueCamerasCount).toBe(3);
    expect(journey!.steps).toHaveLength(3);
    expect(journey!.transitions).toHaveLength(2);

    // First transition: Cam 1 -> Cam 2
    expect(journey!.transitions[0].fromCameraId).toBe('cam-1-entrance');
    expect(journey!.transitions[0].toCameraId).toBe('cam-2-lobby');
    expect(journey!.transitions[0].transitDurationSeconds).toBe(15);
    expect(journey!.transitions[0].isPlausible).toBe(true);

    // Second transition: Cam 2 -> Cam 3
    expect(journey!.transitions[1].fromCameraId).toBe('cam-2-lobby');
    expect(journey!.transitions[1].toCameraId).toBe('cam-3-counters');
    expect(journey!.transitions[1].transitDurationSeconds).toBe(15);
    expect(journey!.transitions[1].isPlausible).toBe(true);

    // 6. Test Forensic Probe Search
    const probeRes = await service.probeSearch({
      tenantId,
      probeEmbedding: personFeature,
      similarityThreshold: 0.85,
    });
    expect(probeRes.matches.length).toBeGreaterThanOrEqual(3);
    expect(probeRes.matches[0].globalId).toBe(globalId);

    // 7. Verify Telemetry Stats
    const stats = await service.getStats(tenantId);
    expect(stats.totalIdentities).toBe(2);
    expect(stats.totalSightings).toBe(4);
    expect(stats.crossCameraTransitions).toBe(1); // One multi-camera person
    expect(stats.activeCameras).toBe(3);
  });
});

describe('Multi-Camera Person Re-ID Fastify REST API Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    const mockStore: any = {
      pool: undefined, // Uses in-memory backing store
    };
    await registerReIdRoutes(app, mockStore);
    await app.ready();
  });

  it('handles full lifecycle: ingest sighting, probe search, list identities, inspect journey, and telemetry', async () => {
    const testVector = makeSyntheticUnitVector(0.55);

    // 1. POST /v1/analytics/reid/sightings
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/reid/sightings',
      headers: { 'x-tenant-id': 'tenant-api-01' },
      payload: {
        cameraId: 'cam-front-door',
        localTrackId: 'trk-001',
        enteredAt: '2026-09-12T10:10:00.000Z',
        exitedAt: '2026-09-12T10:10:25.000Z',
        embedding: testVector,
        confidence: 0.93,
        boundingBox: { x: 50, y: 50, width: 70, height: 180 },
      },
    });

    expect(ingestRes.statusCode).toBe(201);
    const ingestBody = JSON.parse(ingestRes.body);
    expect(ingestBody.success).toBe(true);
    expect(ingestBody.data.isNewIdentity).toBe(true);
    const globalId = ingestBody.data.globalId;

    // 2. GET /v1/analytics/reid/identities
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/reid/identities',
      headers: { 'x-tenant-id': 'tenant-api-01' },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.success).toBe(true);
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].global_id).toBe(globalId);

    // 3. GET /v1/analytics/reid/identities/:globalId
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/analytics/reid/identities/${encodeURIComponent(globalId)}`,
      headers: { 'x-tenant-id': 'tenant-api-01' },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.global_id).toBe(globalId);

    // 4. GET /v1/analytics/reid/journey/:globalId
    const journeyRes = await app.inject({
      method: 'GET',
      url: `/v1/analytics/reid/journey/${encodeURIComponent(globalId)}`,
      headers: { 'x-tenant-id': 'tenant-api-01' },
    });
    expect(journeyRes.statusCode).toBe(200);
    const journeyBody = JSON.parse(journeyRes.body);
    expect(journeyBody.data.totalSightings).toBe(1);

    // 5. POST /v1/analytics/reid/probe
    const probeRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/reid/probe',
      headers: { 'x-tenant-id': 'tenant-api-01' },
      payload: {
        probeEmbedding: testVector,
        similarityThreshold: 0.80,
      },
    });
    expect(probeRes.statusCode).toBe(200);
    const probeBody = JSON.parse(probeRes.body);
    expect(probeBody.success).toBe(true);
    expect(probeBody.data).toHaveLength(1);

    // 6. POST /v1/analytics/reid/topology
    const topPostRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/reid/topology',
      headers: { 'x-tenant-id': 'tenant-api-01' },
      payload: {
        branchId: '00000000-0000-0000-0000-000000000001',
        fromCameraId: 'cam-front-door',
        toCameraId: 'cam-hall',
        minTransitSeconds: 5,
        maxTransitSeconds: 120,
        distanceMeters: 18.5,
      },
    });
    expect(topPostRes.statusCode).toBe(201);

    // 7. GET /v1/analytics/reid/topology
    const topGetRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/reid/topology',
      headers: { 'x-tenant-id': 'tenant-api-01' },
    });
    expect(topGetRes.statusCode).toBe(200);
    const topGetBody = JSON.parse(topGetRes.body);
    expect(topGetBody.data).toHaveLength(1);

    // 8. GET /v1/analytics/reid/stats
    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/reid/stats',
      headers: { 'x-tenant-id': 'tenant-api-01' },
    });
    expect(statsRes.statusCode).toBe(200);
    const statsBody = JSON.parse(statsRes.body);
    expect(statsBody.data.totalIdentities).toBe(1);

    await app.close();
  });
});
