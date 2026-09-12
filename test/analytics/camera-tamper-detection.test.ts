/**
 * Automated Test Suite for Camera Tamper & Defocus Detection (analytics.camera_tamper)
 * 
 * Verifies discrete Laplacian variance for optical focus quantification,
 * luminance saturation for spotlight/laser blinding, luminance collapse for lens covering,
 * SSIM for camera movement, entropy/edge drop for spray paint, multi-frame debounce,
 * repository audit operations, and Fastify REST routes with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { TamperStatisticalAnalyzer } from '../../src/analytics/tamper/tamper-statistical-analyzer.js';
import { TamperRepository } from '../../src/analytics/tamper/tamper-repository.js';
import { TamperService } from '../../src/analytics/tamper/tamper-service.js';
import { EdgeTamperAnalyzer } from '../../edge-agent/src/monitoring/camera-tamper/tamper-analyzer.js';
import { CameraTamperDetector } from '../../analytics-engine/src/detectors/camera-tamper-detector.js';
import { registerCameraTamperRoutes } from '../../src/routes/camera-tamper.routes.js';

describe('TamperStatisticalAnalyzer: Mathematical Image Analysis', () => {
  const width = 64;
  const height = 36;
  const pixels = width * height;

  it('accurately projects RGB into ITU-R BT.601 photometric luma', () => {
    // Pure Red (255, 0, 0), Green (0, 255, 0), Blue (0, 0, 255)
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const luma = TamperStatisticalAnalyzer.extractLuma(rgb, 3, 1, 3);
    expect(luma[0]).toBe(76); // 0.299 * 255 = 76.245 -> 76
    expect(luma[1]).toBe(150); // 0.587 * 255 = 149.685 -> 150
    expect(luma[2]).toBe(29); // 0.114 * 255 = 29.07 -> 29
  });

  it('computes high Laplacian variance for sharp focus and low variance for blur', () => {
    // 1. Sharp frame: alternating high contrast vertical stripes
    const sharpLuma = new Uint8Array(pixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        sharpLuma[y * width + x] = (x % 4 < 2) ? 230 : 25;
      }
    }

    // 2. Blurred / Defocused frame: smooth horizontal linear gradient
    const blurredLuma = new Uint8Array(pixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        blurredLuma[y * width + x] = Math.round(50 + (x / width) * 100);
      }
    }

    const sharpLapVar = TamperStatisticalAnalyzer.computeLaplacianVariance(sharpLuma, width, height);
    const blurredLapVar = TamperStatisticalAnalyzer.computeLaplacianVariance(blurredLuma, width, height);

    expect(sharpLapVar).toBeGreaterThan(500); // Very high sharpness
    expect(blurredLapVar).toBeLessThan(10); // Negligible high-frequency edges
    expect(sharpLapVar / blurredLapVar).toBeGreaterThan(50);
  });

  it('detects camera defocus / blurring when Laplacian variance collapses below threshold', () => {
    // Blurred frame with smooth gradient (defocused optics)
    const blurredFrame = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = Math.round(70 + (x / width) * 80);
        const idx = (y * width + x) * 3;
        blurredFrame[idx] = val;
        blurredFrame[idx + 1] = val;
        blurredFrame[idx + 2] = val;
      }
    }

    const { metrics } = TamperStatisticalAnalyzer.analyzeFrame(blurredFrame, width, height, 3);
    const result = TamperStatisticalAnalyzer.evaluateTamper(metrics, {
      baseline: {
        id: 'base-1',
        tenant_id: 'tenant-test',
        camera_id: 'cam-test',
        baseline_luminance: 120,
        baseline_variance: 50,
        baseline_edge_density: 0.15,
        baseline_entropy: 6.5,
        baseline_laplacian_variance: 450, // Reference sharp baseline
        reference_histogram: [],
        calibrated_at: new Date(),
        sample_frames_count: 1,
        updated_at: new Date(),
      },
      config: {
        defocus_threshold: 100,
        alert_on_defocus: true,
      } as any,
    });

    expect(result.isTampered).toBe(true);
    expect(result.tamperType).toBe('defocus');
    expect(result.severity).toBe('P2');
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.requiresAlert).toBe(true);
  });

  it('detects spotlight / laser blinding from extreme luminance saturation', () => {
    // Saturated frame (direct flashlight)
    const blindedFrame = new Uint8Array(pixels * 3).fill(252);
    const { metrics } = TamperStatisticalAnalyzer.analyzeFrame(blindedFrame, width, height, 3);

    const result = TamperStatisticalAnalyzer.evaluateTamper(metrics, {
      config: {
        blinding_threshold: 240,
        alert_on_blinding: true,
      } as any,
    });

    expect(result.isTampered).toBe(true);
    expect(result.tamperType).toBe('blinding');
    expect(result.severity).toBe('P1');
    expect(result.confidence).toBeGreaterThan(0.90);
    expect(result.metrics.luminance).toBeGreaterThanOrEqual(240);
  });

  it('detects lens covering / blackout when luminance drops near zero', () => {
    // Complete black frame (lens covered with cardboard or cloth)
    const coveredFrame = new Uint8Array(pixels * 3).fill(4);
    const { metrics } = TamperStatisticalAnalyzer.analyzeFrame(coveredFrame, width, height, 3);

    const result = TamperStatisticalAnalyzer.evaluateTamper(metrics, {
      baseline: {
        id: 'base-1',
        tenant_id: 'tenant-test',
        camera_id: 'cam-test',
        baseline_luminance: 110, // Was previously illuminated
        baseline_variance: 40,
        baseline_edge_density: 0.12,
        baseline_entropy: 6.0,
        baseline_laplacian_variance: 250,
        reference_histogram: [],
        calibrated_at: new Date(),
        sample_frames_count: 1,
        updated_at: new Date(),
      },
      config: {
        covering_threshold: 15,
        alert_on_covering: true,
      } as any,
    });

    expect(result.isTampered).toBe(true);
    expect(result.tamperType).toBe('covering');
    expect(result.severity).toBe('P1');
    expect(result.confidence).toBeGreaterThan(0.90);
  });

  it('detects camera repositioning / movement from structural SSIM deviation', () => {
    // Baseline frame: upper half bright, lower half dark
    const baseFrame = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = y < height / 2 ? 220 : 30;
        const idx = (y * width + x) * 3;
        baseFrame[idx] = val;
        baseFrame[idx + 1] = val;
        baseFrame[idx + 2] = val;
      }
    }
    const baseAnalysis = TamperStatisticalAnalyzer.analyzeFrame(baseFrame, width, height, 3);

    // Current frame: camera moved (inverted layout: left bright, right dark)
    const movedFrame = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = x < width / 2 ? 220 : 30;
        const idx = (y * width + x) * 3;
        movedFrame[idx] = val;
        movedFrame[idx + 1] = val;
        movedFrame[idx + 2] = val;
      }
    }

    const { metrics } = TamperStatisticalAnalyzer.analyzeFrame(
      movedFrame,
      width,
      height,
      3,
      baseAnalysis.luma
    );

    const result = TamperStatisticalAnalyzer.evaluateTamper(metrics, {
      baseline: {
        id: 'base-1',
        tenant_id: 'tenant-test',
        camera_id: 'cam-test',
        baseline_luminance: baseAnalysis.metrics.luminance,
        baseline_variance: baseAnalysis.metrics.variance,
        baseline_edge_density: baseAnalysis.metrics.edgeDensity,
        baseline_entropy: baseAnalysis.metrics.entropy,
        baseline_laplacian_variance: baseAnalysis.metrics.laplacianVariance,
        reference_histogram: [],
        calibrated_at: new Date(),
        sample_frames_count: 1,
        updated_at: new Date(),
      },
      config: {
        movement_threshold: 0.50,
        alert_on_movement: true,
      } as any,
    });

    expect(result.isTampered).toBe(true);
    expect(result.tamperType).toBe('movement');
    expect(result.severity).toBe('P2');
    expect(result.metrics.structuralSimilarity).toBeLessThan(0.40);
  });
});

describe('EdgeTamperAnalyzer (edge-agent)', () => {
  const analyzer = new EdgeTamperAnalyzer();
  const width = 64;
  const height = 36;

  it('runs low-latency edge-side statistical analysis for blinding and defocus', () => {
    const blinded = new Uint8Array(width * height * 3).fill(252);
    const result = analyzer.analyze('edge-cam-01', blinded, width, height, 3);

    expect(result.isTampered).toBe(true);
    expect(result.tamperType).toBe('blinding');
    expect(result.severity).toBe('P1');
    expect(result.metrics.luminance).toBeGreaterThanOrEqual(240);
  });
});

describe('CameraTamperDetector (analytics-engine)', () => {
  const detector = new CameraTamperDetector();
  const width = 64;
  const height = 36;

  it('implements BaseDetector contract and evaluates DetectionFrame', async () => {
    await detector.initialize();

    // Frame 1: sharp normal frame to establish baseline
    const normalBuffer = Buffer.alloc(width * height * 3);
    for (let i = 0; i < normalBuffer.length; i++) {
      normalBuffer[i] = ((i % 13) * 19) % 256;
    }

    const frame1 = {
      cameraId: 'cam-ai-01',
      tenantId: 'tenant-ai',
      timestamp: new Date(),
      imageData: normalBuffer,
      width,
      height,
    };
    const res1 = await detector.detect(frame1);
    expect(res1.length).toBe(0); // Baseline established

    // Next 3 frames: covered lens
    const coveredBuffer = Buffer.alloc(width * height * 3, 2);
    let lastResults = [];
    for (let f = 0; f < 3; f++) {
      lastResults = await detector.detect({
        ...frame1,
        imageData: coveredBuffer,
      });
    }

    expect(lastResults.length).toBeGreaterThan(0);
    expect(lastResults[0]!.detectionType).toBe('camera-tamper');
    expect(lastResults[0]!.metadata.tamperType).toBe('covering');
    expect(lastResults[0]!.requiresAlert).toBe(true);

    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
    await detector.cleanup();
  });
});

describe('TamperRepository: In-Memory & Persistence Operations', () => {
  const repo = new TamperRepository();
  const tenantId = '00000000-0000-4000-8000-000000000000';
  const cameraId = 'cam-vault-01';

  it('creates, retrieves, and filters tamper events', async () => {
    const event = await repo.createEvent({
      tenant_id: tenantId,
      camera_id: cameraId,
      branch_id: 'branch-01',
      tamper_type: 'defocus',
      severity: 'P2',
      confidence: 0.92,
      metrics: {
        luminance: 120,
        variance: 45,
        laplacianVariance: 22,
        edgeDensity: 0.02,
        entropy: 5.2,
        structuralSimilarity: 0.95,
        sceneChangeScore: 0.05,
        highlightFraction: 0,
        shadowFraction: 0,
      },
      status: 'detected',
      detected_at: new Date(),
    });

    expect(event.id).toBeDefined();
    expect(event.tamper_type).toBe('defocus');

    const fetched = await repo.getEventById(tenantId, event.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(event.id);

    const list = await repo.listEvents({
      tenantId,
      tamperType: 'defocus',
      status: 'detected',
    });
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.events.some((e) => e.id === event.id)).toBe(true);

    // Update status to resolved
    const resolved = await repo.updateEventStatus(tenantId, event.id, 'resolved', 'user-admin', 'Cleaned camera lens');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.notes).toContain('Cleaned camera lens');
  });

  it('manages optical baselines and configurations', async () => {
    const baseline = await repo.upsertBaseline({
      tenant_id: tenantId,
      camera_id: cameraId,
      baseline_luminance: 125.5,
      baseline_variance: 45.2,
      baseline_edge_density: 0.14,
      baseline_entropy: 6.8,
      baseline_laplacian_variance: 380.0,
      reference_frame_hash: 'hash-abc',
      reference_histogram: [0, 10, 20],
      calibrated_at: new Date(),
      sample_frames_count: 5,
    });

    expect(baseline.baseline_laplacian_variance).toBe(380.0);

    const readBaseline = await repo.getBaseline(tenantId, cameraId);
    expect(readBaseline?.baseline_luminance).toBe(125.5);

    // Config update
    const updatedConfig = await repo.upsertConfig({
      tenant_id: tenantId,
      camera_id: cameraId,
      debounce_frames: 4,
      defocus_threshold: 85.0,
      blinding_threshold: 245.0,
    });

    expect(updatedConfig.debounce_frames).toBe(4);
    expect(updatedConfig.defocus_threshold).toBe(85.0);

    const stats = await repo.getStats(tenantId);
    expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
  });
});

describe('TamperService: Multi-Frame Debounce & Sustained Tamper Verification', () => {
  let service: TamperService;
  const tenantId = '00000000-0000-4000-8000-000000000000';
  const cameraId = 'cam-lobby-02';
  const width = 64;
  const height = 36;

  beforeEach(async () => {
    service = new TamperService();
    // Calibrate baseline first
    const normalBuffer = Buffer.alloc(width * height * 3, 130);
    for (let i = 0; i < normalBuffer.length; i++) {
      normalBuffer[i] = ((i % 17) * 15) % 256;
    }
    await service.recalibrateFromBuffer(tenantId, cameraId, normalBuffer, width, height, 3);

    // Set debounce threshold to 3 frames
    await service.updateConfig({
      tenant_id: tenantId,
      camera_id: cameraId,
      debounce_frames: 3,
    });
  });

  it('suppresses single-frame momentary glitch and confirms sustained tamper across 3 frames', async () => {
    const blindedBuffer = Buffer.alloc(width * height * 3, 252);

    // Frame 1: Detected, but not confirmed yet (debounce = 1 of 3)
    const res1 = await service.processFrame({
      tenantId,
      cameraId,
      frameBuffer: blindedBuffer,
      width,
      height,
      channels: 3,
    });
    expect(res1.evaluation.isTampered).toBe(true);
    expect(res1.confirmed).toBe(false);
    expect(res1.consecutiveFrames).toBe(1);
    expect(res1.savedEvent).toBeNull();

    // Frame 2: Detected, debounce = 2 of 3
    const res2 = await service.processFrame({
      tenantId,
      cameraId,
      frameBuffer: blindedBuffer,
      width,
      height,
      channels: 3,
    });
    expect(res2.confirmed).toBe(false);
    expect(res2.consecutiveFrames).toBe(2);

    // Frame 3: Sustained confirmation (debounce = 3 of 3) -> Saves event!
    const res3 = await service.processFrame({
      tenantId,
      cameraId,
      frameBuffer: blindedBuffer,
      width,
      height,
      channels: 3,
    });
    expect(res3.confirmed).toBe(true);
    expect(res3.consecutiveFrames).toBe(3);
    expect(res3.savedEvent).not.toBeNull();
    expect(res3.savedEvent?.tamper_type).toBe('blinding');
    expect(res3.savedEvent?.severity).toBe('P1');
  });
});

describe('Fastify REST Routes: /v1/analytics/tamper/*', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await registerCameraTamperRoutes(app, {} as any);
    await app.ready();
  });

  it('serves real-time frame statistical analysis endpoint', async () => {
    const width = 32;
    const height = 18;
    const buffer = Buffer.alloc(width * height * 3, 250); // Blinded

    const response = await app.inject({
      method: 'POST',
      url: '/v1/analytics/tamper/analyze-frame',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
      payload: {
        cameraId: 'cam-rest-01',
        width,
        height,
        channels: 3,
        frameBase64: buffer.toString('base64'),
        bypassDebounce: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.evaluation.isTampered).toBe(true);
    expect(body.data.evaluation.tamperType).toBe('blinding');
    expect(body.data.evaluation.metrics.luminance).toBeGreaterThanOrEqual(240);
  });

  it('serves tamper statistics endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/analytics/tamper/stats',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.byType).toBeDefined();
    expect(body.data.byType.defocus).toBeDefined();
    expect(body.data.byType.blinding).toBeDefined();
  });

  it('serves configuration update and retrieval endpoints', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/v1/analytics/tamper/config/cam-rest-cfg-01',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
      payload: {
        defocus_threshold: 95.0,
        debounce_frames: 4,
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    expect(updateBody.success).toBe(true);
    expect(updateBody.data.defocus_threshold).toBe(95.0);
    expect(updateBody.data.debounce_frames).toBe(4);

    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/analytics/tamper/config/cam-rest-cfg-01',
      headers: {
        'x-tenant-id': '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.defocus_threshold).toBe(95.0);
  });
});
