/**
 * Automated Test Suite for Camera Obstruction & Dark Frame Detection (analytics.camera_obstruction)
 * 
 * Verifies mathematical heuristic algorithms for:
 * 1. Lens covering (full and partial)
 * 2. Dark frame / optical blackout
 * 3. Legitimate IR night scene false-alarm discrimination
 * 4. Loss of visual variance (dead sensor, static flatline, gray screen)
 * 5. Optical glare / whiteout
 * 6. Edge-agent analyzer execution
 * 7. Analytics engine BaseDetector contract
 * 8. Repository persistence, in-memory fallback, and fleet statistics
 * 9. Multi-frame debounce state machine
 * 10. Fastify REST API endpoints with zero mock data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ObstructionHeuristicAnalyzer } from '../../src/analytics/obstruction/obstruction-heuristic-analyzer.js';
import { ObstructionRepository } from '../../src/analytics/obstruction/obstruction-repository.js';
import { ObstructionService } from '../../src/analytics/obstruction/obstruction-service.js';
import { EdgeObstructionAnalyzer } from '../../edge-agent/src/monitoring/camera-obstruction/obstruction-analyzer.js';
import { CameraObstructionDetector } from '../../analytics-engine/src/detectors/camera-obstruction-detector.js';
import { registerCameraObstructionRoutes } from '../../src/routes/camera-obstruction.routes.js';

describe('ObstructionHeuristicAnalyzer: Mathematical Image Analysis', () => {
  const width = 64;
  const height = 36;
  const pixels = width * height;

  it('accurately projects RGB into ITU-R BT.601 photometric luma', () => {
    // Pure Red (255, 0, 0), Green (0, 255, 0), Blue (0, 0, 255)
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const luma = ObstructionHeuristicAnalyzer.extractLuma(rgb, 3, 1, 3);
    expect(luma[0]).toBe(76);  // 0.299 * 255 = 76.245 -> 76
    expect(luma[1]).toBe(150); // 0.587 * 255 = 149.685 -> 150
    expect(luma[2]).toBe(29);  // 0.114 * 255 = 29.07 -> 29
  });

  it('detects total optical blackout / dark frame when luminance and variance collapse', () => {
    // Frame with near-zero luminance (mean ~2.5) and near-zero variance
    const darkFrame = new Uint8Array(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      const val = 2 + (i % 2);
      darkFrame[i * 3] = val;
      darkFrame[i * 3 + 1] = val;
      darkFrame[i * 3 + 2] = val;
    }

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(darkFrame, width, height, 3);

    expect(result.isObstructed).toBe(true);
    expect(result.obstructionType).toBe('dark_frame');
    expect(result.severity).toBe('P1');
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
    expect(result.requiresAlert).toBe(true);
    expect(result.metrics.shadowFraction).toBeGreaterThan(0.95);
  });

  it('suppresses dark frame alerts on legitimate IR-illuminated night scenes with high edge contrast', () => {
    // Low average luminance (mean ~18), but alternating high contrast stripes simulating street/IR lighting
    const irNightFrame = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = x % 4 < 2 ? 38 : 6;
        const idx = (y * width + x) * 3;
        irNightFrame[idx] = val;
        irNightFrame[idx + 1] = val;
        irNightFrame[idx + 2] = val;
      }
    }

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(irNightFrame, width, height, 3);

    // Should NOT be flagged as dark frame because it retains edge density and spatial variance
    expect(result.obstructionType).not.toBe('dark_frame');
    expect(result.metrics.variance).toBeGreaterThan(25.0);
  });

  it('detects full lens covering from opaque cloth or tape', () => {
    // Cloth covering: dim diffuse luma (e.g. 14) with flat variance across all 16 tiles
    const coveredFrame = new Uint8Array(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      const val = 14 + ((i % 5) - 2);
      coveredFrame[i * 3] = val;
      coveredFrame[i * 3 + 1] = val;
      coveredFrame[i * 3 + 2] = val;
    }

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(coveredFrame, width, height, 3);

    expect(result.isObstructed).toBe(true);
    expect(result.obstructionType).toBe('lens_covering');
    expect(result.severity).toBe('P1');
    expect(result.metrics.obstructionPercent).toBeGreaterThanOrEqual(70.0);
    expect(result.requiresAlert).toBe(true);
  });

  it('detects partial lens obstruction with localized tile grid coordinates', () => {
    // Top-left quadrant occluded (cloth/tape), remaining 3 quadrants sharp with high variance
    const partialFrame = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        if (x < width / 2 && y < height / 2) {
          // Obstructed quadrant: flat black tape
          partialFrame[idx] = 4;
          partialFrame[idx + 1] = 4;
          partialFrame[idx + 2] = 4;
        } else {
          // Active healthy scene: alternating stripes
          const val = (x % 6 < 3) ? 170 : 50;
          partialFrame[idx] = val;
          partialFrame[idx + 1] = val;
          partialFrame[idx + 2] = val;
        }
      }
    }

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(partialFrame, width, height, 3);

    expect(result.isObstructed).toBe(true);
    expect(result.obstructionType).toBe('partial_obstruction');
    expect(result.metrics.obstructionPercent).toBeGreaterThanOrEqual(25.0);
    expect(result.metrics.obstructionPercent).toBeLessThan(70.0);
    expect(result.metrics.tileAnalysis.obstructedBoundingBox).not.toBeNull();
    expect(result.requiresAlert).toBe(true);
  });

  it('detects loss of visual variance on uniform sensor flatline (gray screen)', () => {
    // Uniform gray test screen / frozen sensor output: exactly 128
    const flatlineFrame = new Uint8Array(pixels * 3).fill(128);

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(flatlineFrame, width, height, 3);

    expect(result.isObstructed).toBe(true);
    expect(result.obstructionType).toBe('variance_loss');
    expect(result.severity).toBe('P1');
    expect(result.metrics.variance).toBe(0);
    expect(result.metrics.entropy).toBe(0);
    expect(result.metrics.edgeDensity).toBe(0);
    expect(result.requiresAlert).toBe(true);
  });

  it('detects optical glare / whiteout from intense spotlight', () => {
    // Saturated frame (direct spotlight)
    const glareFrame = new Uint8Array(pixels * 3).fill(250);

    const result = ObstructionHeuristicAnalyzer.analyzeFrame(glareFrame, width, height, 3);

    expect(result.isObstructed).toBe(true);
    expect(result.obstructionType).toBe('glare_whiteout');
    expect(result.severity).toBe('P2');
    expect(result.metrics.highlightFraction).toBeGreaterThan(0.90);
  });
});

describe('EdgeObstructionAnalyzer (edge-agent)', () => {
  const width = 64;
  const height = 36;
  const pixels = width * height;

  it('executes edge-side frame analysis and applies temporal debouncing', () => {
    const analyzer = new EdgeObstructionAnalyzer();
    const darkFrame = new Uint8Array(pixels * 3).fill(3);

    // Frame 1: Pending debounce (count = 1/3)
    const res1 = analyzer.evaluateFrame(darkFrame, width, height, 3, 'cam-edge-01', { debounceFrames: 3 });
    expect(res1.isObstructed).toBe(false);

    // Frame 2: Pending debounce (count = 2/3)
    const res2 = analyzer.evaluateFrame(darkFrame, width, height, 3, 'cam-edge-01', { debounceFrames: 3 });
    expect(res2.isObstructed).toBe(false);

    // Frame 3: Confirmed alert (count = 3/3)
    const res3 = analyzer.evaluateFrame(darkFrame, width, height, 3, 'cam-edge-01', { debounceFrames: 3 });
    expect(res3.isObstructed).toBe(true);
    expect(res3.obstructionType).toBe('dark_frame');
    expect(res3.severity).toBe('P1');
  });
});

describe('CameraObstructionDetector (analytics-engine)', () => {
  it('implements BaseDetector contract and evaluates DetectionFrame', async () => {
    const detector = new CameraObstructionDetector();
    await detector.initialize();

    const width = 64;
    const height = 36;
    const coveredData = Buffer.alloc(width * height * 3, 14);

    const detectionFrame = {
      cameraId: 'cam-ae-01',
      tenantId: 'tenant-ae',
      timestamp: new Date(),
      imageData: coveredData,
      width,
      height,
    };

    // Frame 1 & 2: Debounce accumulation
    await detector.detect(detectionFrame);
    await detector.detect(detectionFrame);

    // Frame 3: Confirmed detection
    const results = await detector.detect(detectionFrame);

    expect(results.length).toBeGreaterThan(0);
    const result = results[0]!;
    expect(result.label).toBe('lens_covering');
    expect(result.metadata.provenance).toBe('HEURISTIC_RULE_ENGINE');
    expect(result.metadata.status).toBe('SUCCESS');
    expect(result.metadata.simulated).toBe(false);
  });
});

describe('ObstructionRepository: In-Memory & Persistence Operations', () => {
  const repository = new ObstructionRepository();

  it('creates, retrieves, and filters obstruction events', async () => {
    const created = await repository.createEvent({
      tenant_id: 'tenant-test',
      camera_id: 'cam-repo-01',
      branch_id: 'branch-01',
      obstruction_type: 'dark_frame',
      severity: 'P1',
      confidence: 0.96,
      obstruction_percent: 100,
      metrics: {
        luminance: 2.1,
        variance: 1.2,
        edgeDensity: 0.001,
        entropy: 0.12,
        laplacianVariance: 0.4,
        shadowFraction: 0.98,
        highlightFraction: 0,
        obstructionPercent: 100,
        tileAnalysis: {
          gridRows: 4,
          gridCols: 4,
          totalTiles: 16,
          obstructedTiles: 16,
          obstructionPercent: 100,
          tiles: [],
        },
      },
      tile_analysis: {
        gridRows: 4,
        gridCols: 4,
        totalTiles: 16,
        obstructedTiles: 16,
        obstructionPercent: 100,
        tiles: [],
      },
      status: 'detected',
      notes: 'Total darkness blackout',
      detected_at: new Date(),
    });

    expect(created.id).toBeDefined();

    const fetched = await repository.getEventById('tenant-test', created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.obstruction_type).toBe('dark_frame');

    const updated = await repository.updateEventStatus('tenant-test', created.id, 'resolved', 'user-guard', 'Lights turned back on');
    expect(updated?.status).toBe('resolved');
    expect(updated?.notes).toBe('Lights turned back on');

    const list = await repository.listEvents({
      tenantId: 'tenant-test',
      cameraId: 'cam-repo-01',
    });
    expect(list.total).toBe(1);
    expect(list.events[0]?.id).toBe(created.id);
  });

  it('manages optical baselines and configurations', async () => {
    const baseline = await repository.upsertBaseline({
      tenant_id: 'tenant-test',
      camera_id: 'cam-repo-02',
      baseline_luminance: 125,
      baseline_variance: 42,
      baseline_edge_density: 0.08,
      baseline_entropy: 6.4,
      baseline_laplacian_variance: 180,
      tile_baselines: [],
      reference_histogram: [],
      calibrated_at: new Date(),
      sample_frames_count: 1,
    });
    expect(baseline.camera_id).toBe('cam-repo-02');

    const retrievedBase = await repository.getBaseline('tenant-test', 'cam-repo-02');
    expect(retrievedBase?.baseline_luminance).toBe(125);

    const config = await repository.upsertConfig({
      tenant_id: 'tenant-test',
      camera_id: 'cam-repo-02',
      darkness_threshold: 10.0,
      variance_floor: 15.0,
      debounce_frames: 4,
    });
    expect(config.darkness_threshold).toBe(10.0);
    expect(config.debounce_frames).toBe(4);
  });
});

describe('ObstructionService: Multi-Frame Debounce & Sustained Detection', () => {
  it('suppresses transient single-frame anomalies and confirms sustained obstruction', async () => {
    const repository = new ObstructionRepository();
    const service = new ObstructionService(repository);
    const width = 64;
    const height = 36;
    const darkBuffer = Buffer.alloc(width * height * 3, 2);

    // Frame 1: Pending debounce
    const res1 = await service.ingestAndAnalyzeFrame({
      tenantId: 'tenant-service',
      cameraId: 'cam-deb-01',
      buffer: darkBuffer,
      dimensions: { width, height, channels: 3 },
    });
    expect(res1.evaluation.isObstructed).toBe(true);
    expect(res1.confirmed).toBe(false);
    expect(res1.savedEvent).toBeNull();
    expect(res1.consecutiveFrames).toBe(1);

    // Frame 2: Still pending (count = 2/3)
    const res2 = await service.ingestAndAnalyzeFrame({
      tenantId: 'tenant-service',
      cameraId: 'cam-deb-01',
      buffer: darkBuffer,
      dimensions: { width, height, channels: 3 },
    });
    expect(res2.confirmed).toBe(false);
    expect(res2.consecutiveFrames).toBe(2);

    // Frame 3: Confirmed persistent incident!
    const res3 = await service.ingestAndAnalyzeFrame({
      tenantId: 'tenant-service',
      cameraId: 'cam-deb-01',
      buffer: darkBuffer,
      dimensions: { width, height, channels: 3 },
    });
    expect(res3.confirmed).toBe(true);
    expect(res3.consecutiveFrames).toBe(3);
    expect(res3.savedEvent).not.toBeNull();
    expect(res3.savedEvent?.status).toBe('detected');
    expect(res3.savedEvent?.severity).toBe('P1');
  });
});

describe('Fastify REST Routes: /v1/analytics/obstruction/*', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify();
    const mockStore = {
      pool: undefined, // Uses in-memory fallback
    };
    await registerCameraObstructionRoutes(app, mockStore as any);
  });

  it('serves real-time frame heuristic analysis endpoint', async () => {
    // Generate flatline gray frame
    const width = 64;
    const height = 36;
    const flatBuffer = Buffer.alloc(width * height * 3, 128);
    const base64 = flatBuffer.toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/analytics/obstruction/analyze-frame',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
      payload: {
        cameraId: 'cam-fastify-01',
        frameBase64: base64,
        width,
        height,
        channels: 3,
        bypassDebounce: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.evaluation.isObstructed).toBe(true);
    expect(body.data.evaluation.obstructionType).toBe('variance_loss');
    expect(body.data.evaluation.severity).toBe('P1');
  });

  it('serves obstruction statistics endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/obstruction/stats',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalEvents).toBeDefined();
    expect(body.data.camerasMonitored).toBeGreaterThanOrEqual(1);
  });

  it('serves configuration update and retrieval endpoints', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/v1/analytics/obstruction/config/cam-config-01',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
      payload: {
        darknessThreshold: 12.0,
        varianceFloor: 16.0,
        debounceFrames: 5,
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    expect(updateBody.data.darkness_threshold).toBe(12.0);
    expect(updateBody.data.debounce_frames).toBe(5);

    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/obstruction/config/cam-config-01',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.darkness_threshold).toBe(12.0);
  });
});
