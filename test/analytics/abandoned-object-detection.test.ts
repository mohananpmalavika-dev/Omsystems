/**
 * Automated Test Suite for Abandoned & Unattended Object Detection (analytics.abandoned_object)
 * 
 * Verifies mathematical static foreground blob tracking, dual-background differencing,
 * ray-casting Jordan curve point-in-polygon containment, owner separation kinematics,
 * repository CRUD operations, multi-frame debounce, and Fastify REST routes with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { StaticBlobTracker } from '../../src/analytics/abandoned-object/static-blob-tracker.js';
import { AbandonedObjectRepository } from '../../src/analytics/abandoned-object/abandoned-object-repository.js';
import { AbandonedObjectService } from '../../src/analytics/abandoned-object/abandoned-object-service.js';
import { EdgeAbandonedObjectAnalyzer } from '../../edge-agent/src/monitoring/abandoned-object/abandoned-object-analyzer.js';
import { UnattendedObjectsDetector } from '../../analytics-engine/src/detectors/unattended-objects-detector.js';
import { registerAbandonedObjectRoutes } from '../../src/routes/abandoned-object.routes.js';

describe('StaticBlobTracker: Mathematical Image & Kinematic Analysis', () => {
  const width = 64;
  const height = 36;
  const pixels = width * height;

  it('accurately projects RGB frame buffer into ITU-R BT.601 photometric luma', () => {
    // Red (255, 0, 0), Green (0, 255, 0), Blue (0, 0, 255)
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const luma = StaticBlobTracker.extractLuma(rgb, 3, 1, 3);
    expect(luma[0]).toBe(76);  // 0.299 * 255 = 76.245 -> 76
    expect(luma[1]).toBe(150); // 0.587 * 255 = 149.685 -> 150
    expect(luma[2]).toBe(29);  // 0.114 * 255 = 29.07 -> 29
  });

  it('evaluates arbitrary polygon containment via ray-casting (Jordan Curve Theorem)', () => {
    const polygon = [
      { x: 10, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 80 },
      { x: 10, y: 80 },
    ];

    // Inside points
    expect(StaticBlobTracker.isPointInPolygon({ x: 50, y: 50 }, polygon)).toBe(true);
    expect(StaticBlobTracker.isPointInPolygon({ x: 15, y: 15 }, polygon)).toBe(true);

    // Outside points
    expect(StaticBlobTracker.isPointInPolygon({ x: 5, y: 50 }, polygon)).toBe(false);
    expect(StaticBlobTracker.isPointInPolygon({ x: 150, y: 50 }, polygon)).toBe(false);
    expect(StaticBlobTracker.isPointInPolygon({ x: 50, y: 95 }, polygon)).toBe(false);
  });

  it('accurately computes Intersection over Union (IoU)', () => {
    const b1 = { x: 10, y: 10, width: 20, height: 20 }; // Area = 400
    const b2 = { x: 20, y: 10, width: 20, height: 20 }; // Overlap: x in [20, 30], y in [10, 30] -> 10*20 = 200
    // Union = 400 + 400 - 200 = 600. IoU = 200/600 = 0.3333

    const iou = StaticBlobTracker.computeIoU(b1, b2);
    expect(iou).toBeCloseTo(0.333, 2);

    // Non-overlapping
    const b3 = { x: 100, y: 100, width: 20, height: 20 };
    expect(StaticBlobTracker.computeIoU(b1, b3)).toBe(0);
  });

  it('measures centroid distance and correlates person proximity', () => {
    const c1 = { x: 10, y: 10 };
    const c2 = { x: 10, y: 50 };
    expect(StaticBlobTracker.getCentroidDistance(c1, c2)).toBe(40);

    const persons = [
      {
        trackId: 'person-1',
        boundingBox: { x: 100, y: 100, width: 30, height: 80 }, // Center: (115, 140)
        confidence: 0.92,
      },
      {
        trackId: 'person-2',
        boundingBox: { x: 20, y: 20, width: 20, height: 50 },   // Center: (30, 45)
        confidence: 0.88,
      },
    ];

    const blobCentroid = { x: 35, y: 50 };
    const { closestPerson, distancePx } = StaticBlobTracker.correlatePersonProximity(blobCentroid, persons);

    expect(closestPerson?.trackId).toBe('person-2');
    expect(distancePx).toBeLessThan(10);
  });

  it('classifies object categories based on aspect ratio and bounding scale', () => {
    // Large rectangular object -> suitcase
    const suitcase = StaticBlobTracker.classifyBlob({ x: 0, y: 0, width: 140, height: 80 });
    expect(suitcase).toBe('suitcase');

    // Square medium object -> box
    const box = StaticBlobTracker.classifyBlob({ x: 0, y: 0, width: 70, height: 65 });
    expect(box).toBe('box');

    // Small package -> parcel
    const parcel = StaticBlobTracker.classifyBlob({ x: 0, y: 0, width: 40, height: 35 });
    expect(parcel).toBe('parcel');
  });

  it('detects static foreground blobs and accumulates dwell time across consecutive frames', () => {
    const tracker = new StaticBlobTracker(15.0, 120.0);
    const zones = [
      {
        id: 'z-test-1',
        tenant_id: 'tenant-test',
        zone_name: 'Test ATM Zone',
        zone_type: 'atm_vestibule' as const,
        polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }],
        sensitivity: 'high' as const,
        unattended_threshold_seconds: 2,
        abandoned_threshold_seconds: 5,
        min_blob_area_pixels: 100,
        max_blob_area_pixels: 50000,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const t0 = new Date('2026-09-12T10:00:00Z');
    const t1 = new Date('2026-09-12T10:00:01Z');
    const t2 = new Date('2026-09-12T10:00:03Z'); // 3 seconds dwell

    const staticBox = { x: 50, y: 50, width: 40, height: 40 };

    // Frame 1: Deposited (dwell = 0s)
    const res1 = tracker.processFrameBlobs({
      candidateBlobs: [staticBox],
      persons: [],
      zones,
      timestamp: t0,
    });
    expect(res1.isUnattendedOrAbandoned).toBe(false);

    // Frame 2: 1s elapsed
    const res2 = tracker.processFrameBlobs({
      candidateBlobs: [staticBox],
      persons: [],
      zones,
      timestamp: t1,
    });
    expect(res2.isUnattendedOrAbandoned).toBe(false);

    // Frame 3: 3s elapsed -> exceeds unattended_threshold_seconds (2s)
    const res3 = tracker.processFrameBlobs({
      candidateBlobs: [staticBox],
      persons: [],
      zones,
      timestamp: t2,
    });
    expect(res3.isUnattendedOrAbandoned).toBe(true);
    expect(res3.blobs.length).toBe(1);
    expect(res3.blobs[0]?.eventType).toBe('unattended_object');
    expect(res3.blobs[0]?.dwellTimeSeconds).toBeGreaterThanOrEqual(2);
    expect(res3.blobs[0]?.zoneName).toBe('Test ATM Zone');
  });
});

describe('EdgeAbandonedObjectAnalyzer (edge-agent)', () => {
  const analyzer = new EdgeAbandonedObjectAnalyzer(15, 2, 5, 2);
  const width = 64;
  const height = 36;
  const pixels = width * height;

  it('runs edge-side static blob tracking with background differencing', () => {
    const cameraId = 'cam-edge-01';

    // Baseline background frame: uniform ambient 120
    const normalFrame = new Uint8Array(pixels * 3).fill(120);
    analyzer.analyze(cameraId, normalFrame, width, height, 3, new Date('2026-09-12T10:00:00Z'));

    // Deposited object frame: block of high contrast 220 at (x: 16-32, y: 8-24)
    const objectFrame = new Uint8Array(pixels * 3).fill(120);
    for (let y = 8; y < 24; y++) {
      for (let x = 16; x < 32; x++) {
        const idx = (y * width + x) * 3;
        objectFrame[idx] = 220;
        objectFrame[idx + 1] = 220;
        objectFrame[idx + 2] = 220;
      }
    }

    // Frame 1: First detected
    const res1 = analyzer.analyze(cameraId, objectFrame, width, height, 3, new Date('2026-09-12T10:00:00Z'));
    expect(res1.activeBlobsCount).toBe(1);
    expect(res1.hasUnattendedObjects).toBe(false);

    // Frame 2: Sustained after 3 seconds -> emits alert
    const res2 = analyzer.analyze(cameraId, objectFrame, width, height, 3, new Date('2026-09-12T10:00:03Z'));
    expect(res2.hasUnattendedObjects).toBe(true);
    expect(res2.alerts.length).toBe(1);
    expect(res2.alerts[0]?.dwellTimeSeconds).toBeGreaterThanOrEqual(2);
  });
});

describe('UnattendedObjectsDetector (analytics-engine)', () => {
  const detector = new UnattendedObjectsDetector({
    unattendedThresholdSeconds: 2,
    abandonedThresholdSeconds: 5,
  });

  it('implements BaseDetector contract and evaluates DetectionFrame', async () => {
    await detector.initialize();

    const width = 64;
    const height = 36;
    const normalBuffer = Buffer.alloc(width * height * 3, 110);

    const frame1 = {
      cameraId: 'cam-ai-01',
      tenantId: 'tenant-ai',
      timestamp: new Date('2026-09-12T10:00:00Z'),
      imageData: normalBuffer,
      width,
      height,
    };

    // Frame 1: establish background
    const r1 = await detector.detect(frame1);
    expect(r1.length).toBe(0);

    // Frame 2: Deposited object block
    const objectBuffer = Buffer.alloc(width * height * 3, 110);
    for (let y = 10; y < 24; y++) {
      for (let x = 15; x < 30; x++) {
        const idx = (y * width + x) * 3;
        objectBuffer[idx] = 230;
        objectBuffer[idx + 1] = 230;
        objectBuffer[idx + 2] = 230;
      }
    }

    // Feed 3 frames over 3 seconds
    await detector.detect({ ...frame1, imageData: objectBuffer, timestamp: new Date('2026-09-12T10:00:01Z') });
    await detector.detect({ ...frame1, imageData: objectBuffer, timestamp: new Date('2026-09-12T10:00:02Z') });
    const rLast = await detector.detect({ ...frame1, imageData: objectBuffer, timestamp: new Date('2026-09-12T10:00:04Z') });

    expect(rLast.length).toBe(1);
    expect(rLast[0]?.detectionType).toBe('unattended-object');
    expect(rLast[0]?.requiresAlert).toBe(true);

    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
    await detector.cleanup();
  });
});

describe('AbandonedObjectRepository: Persistence Operations', () => {
  const repo = new AbandonedObjectRepository();
  const tenantId = '00000000-0000-4000-8000-000000000000';
  const cameraId = 'cam-vault-01';

  it('creates, retrieves, filters events, and updates resolution status', async () => {
    const event = await repo.createEvent({
      tenant_id: tenantId,
      camera_id: cameraId,
      branch_id: 'branch-01',
      zone_id: 'zone-1',
      event_type: 'unattended_object',
      object_type: 'backpack',
      severity: 'P2',
      confidence: 0.94,
      bounding_box: { x: 50, y: 50, width: 40, height: 50 },
      dwell_time_seconds: 65,
      owner_track_id: 'p-99',
      owner_distance_pixels: 145.0,
      status: 'detected',
      first_seen_at: new Date(Date.now() - 65000),
      detected_at: new Date(),
    });

    expect(event.id).toBeDefined();
    expect(event.object_type).toBe('backpack');

    const fetched = await repo.getEventById(tenantId, event.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(event.id);

    const list = await repo.listEvents({
      tenantId,
      cameraId,
      status: 'detected',
    });
    expect(list.total).toBeGreaterThanOrEqual(1);

    // Update status to escalated
    const updated = await repo.updateEventStatus(tenantId, event.id, 'escalated', 'admin-user', 'Security dispatched to vault');
    expect(updated?.status).toBe('escalated');
    expect(updated?.notes).toContain('Security dispatched');
  });

  it('manages monitored sensitive zones and camera configurations', async () => {
    const zone = await repo.createZone({
      tenant_id: tenantId,
      branch_id: 'branch-01',
      camera_id: cameraId,
      zone_name: 'Sterile Cash Transfer Corridor',
      zone_type: 'sterile_zone',
      polygon: [{ x: 10, y: 10 }, { x: 300, y: 10 }, { x: 300, y: 300 }, { x: 10, y: 300 }],
      sensitivity: 'critical',
      unattended_threshold_seconds: 30,
      abandoned_threshold_seconds: 90,
      min_blob_area_pixels: 100,
      max_blob_area_pixels: 40000,
      enabled: true,
    });

    expect(zone.id).toBeDefined();
    expect(zone.sensitivity).toBe('critical');

    const zonesList = await repo.listZones({ tenantId, cameraId });
    expect(zonesList.some((z) => z.id === zone.id)).toBe(true);

    // Update config
    const config = await repo.upsertConfig({
      tenant_id: tenantId,
      camera_id: cameraId,
      stationary_pixel_threshold: 10.0,
      default_unattended_threshold_sec: 40,
      default_abandoned_threshold_sec: 100,
      owner_proximity_threshold_px: 150.0,
      debounce_frames: 4,
      alert_on_sterile_zone_entry: true,
      alert_on_exit_corridor_obstruction: true,
      thermal_verification_enabled: false,
    });

    expect(config.default_unattended_threshold_sec).toBe(40);

    const stats = await repo.getStats(tenantId);
    expect(stats.zonesMonitored).toBeGreaterThanOrEqual(1);
  });
});

describe('AbandonedObjectService: End-to-End Orchestration', () => {
  let service: AbandonedObjectService;
  const tenantId = '00000000-0000-4000-8000-000000000000';
  const cameraId = 'cam-lobby-05';

  beforeEach(async () => {
    service = new AbandonedObjectService();
    await service.updateConfig({
      tenant_id: tenantId,
      camera_id: cameraId,
      stationary_pixel_threshold: 15.0,
      default_unattended_threshold_sec: 2,
      default_abandoned_threshold_sec: 5,
      owner_proximity_threshold_px: 120.0,
      debounce_frames: 2,
      alert_on_sterile_zone_entry: true,
      alert_on_exit_corridor_obstruction: true,
      thermal_verification_enabled: false,
    });
  });

  it('processes multi-frame observations, triggers alert, and persists event', async () => {
    const staticBlob = { x: 100, y: 100, width: 50, height: 60 };

    // Frame 1 (t = 0s)
    await service.processObservations({
      tenantId,
      cameraId,
      candidateBlobs: [staticBlob],
      timestamp: new Date('2026-09-12T10:00:00Z'),
    });

    // Frame 2 (t = 1s)
    await service.processObservations({
      tenantId,
      cameraId,
      candidateBlobs: [staticBlob],
      timestamp: new Date('2026-09-12T10:00:01Z'),
    });

    // Frame 3 (t = 3s) -> Dwell = 3s >= 2s threshold -> Generates and persists event
    const res3 = await service.processObservations({
      tenantId,
      cameraId,
      candidateBlobs: [staticBlob],
      timestamp: new Date('2026-09-12T10:00:03Z'),
    });

    expect(res3.analysis.isUnattendedOrAbandoned).toBe(true);
    expect(res3.savedEvents.length).toBe(1);
    expect(res3.savedEvents[0]?.object_type).toBe('parcel');
    expect(res3.savedEvents[0]?.status).toBe('detected');
  });
});

describe('Fastify REST Routes: /v1/analytics/abandoned-objects/*', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify();
    await registerAbandonedObjectRoutes(app, {} as any);
  });

  it('serves list and stats endpoints with zero mock data', async () => {
    // 1. Stats
    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/abandoned-objects/stats',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(statsRes.statusCode).toBe(200);
    const statsBody = JSON.parse(statsRes.body);
    expect(statsBody.success).toBe(true);
    expect(statsBody.data).toHaveProperty('totalActive');

    // 2. List Events
    const eventsRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/abandoned-objects/events',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(eventsRes.statusCode).toBe(200);
    const eventsBody = JSON.parse(eventsRes.body);
    expect(eventsBody.success).toBe(true);
    expect(Array.isArray(eventsBody.data)).toBe(true);

    // 3. List Zones
    const zonesRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/abandoned-objects/zones',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
    });
    expect(zonesRes.statusCode).toBe(200);
    const zonesBody = JSON.parse(zonesRes.body);
    expect(zonesBody.success).toBe(true);
    expect(zonesBody.data.length).toBeGreaterThanOrEqual(1);

    // 4. Ingest Telemetry Event
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/abandoned-objects/events',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: {
        cameraId: 'cam-rest-01',
        eventType: 'unattended_object',
        objectType: 'parcel',
        severity: 'P2',
        confidence: 0.91,
        boundingBox: { x: 100, y: 120, width: 40, height: 35 },
        dwellTimeSeconds: 70,
        ownerDistancePixels: 130,
      },
    });
    expect(ingestRes.statusCode).toBe(201);
    const ingestBody = JSON.parse(ingestRes.body);
    expect(ingestBody.success).toBe(true);
    const eventId = ingestBody.data.id;

    // 5. Update Status
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/v1/analytics/abandoned-objects/events/${eventId}/status`,
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
        'x-user-id': 'user-auditor-1',
      },
      payload: {
        status: 'investigating',
        notes: 'Officer dispatched to inspect unattended parcel',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    expect(updateBody.data.status).toBe('investigating');

    // 6. Real-time Frame Analysis endpoint
    const analyzeRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/abandoned-objects/analyze-frame',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: {
        cameraId: 'cam-rest-01',
        candidateBlobs: [{ x: 100, y: 120, width: 40, height: 35 }],
        persons: [{ trackId: 'p-1', boundingBox: { x: 300, y: 100, width: 50, height: 120 }, confidence: 0.9 }],
        saveToDb: false,
      },
    });
    expect(analyzeRes.statusCode).toBe(200);
    const analyzeBody = JSON.parse(analyzeRes.body);
    expect(analyzeBody.success).toBe(true);
    expect(analyzeBody.data.analysis).toHaveProperty('isUnattendedOrAbandoned');
  });
});
