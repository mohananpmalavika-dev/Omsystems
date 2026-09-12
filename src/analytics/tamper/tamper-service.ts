/**
 * Camera Tamper & Defocus Detection Service
 * 
 * Orchestrates real-time statistical frame analysis, multi-frame debounce confirmation,
 * dynamic optical baseline calibration, incident logging, and operational telemetry.
 */

import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import {
  TamperStatisticalAnalyzer,
  type FrameDimensions,
} from './tamper-statistical-analyzer.js';
import {
  TamperRepository,
} from './tamper-repository.js';
import type {
  TamperType,
  TamperSeverity,
  TamperStatus,
  TamperMetrics,
  TamperEvaluationResult,
  CameraTamperEventRecord,
  CameraTamperBaselineRecord,
  CameraTamperConfigRecord,
  ListTamperEventsFilter,
  TamperStats,
} from './tamper-types.js';

interface DebounceState {
  consecutiveCount: number;
  tamperType: TamperType | null;
  firstDetectedAt: Date;
  lastReportedEventId?: string;
}

export interface EvaluateFrameInput {
  tenantId: string;
  cameraId: string;
  branchId?: string | null;
  frameBuffer: Uint8Array | Buffer;
  width: number;
  height: number;
  channels?: 1 | 3 | 4;
  snapshotUrl?: string | null;
  bypassDebounce?: boolean;
}

export class TamperService extends EventEmitter {
  private readonly repository: TamperRepository;
  private readonly debounceStates = new Map<string, DebounceState>();
  private readonly cachedBaselineLuma = new Map<string, Uint8Array>();

  constructor(pool?: Pool) {
    super();
    this.repository = new TamperRepository(pool);
  }

  public getRepository(): TamperRepository {
    return this.repository;
  }

  /**
   * Process a single camera frame through statistical tamper analysis
   */
  public async processFrame(input: EvaluateFrameInput): Promise<{
    evaluation: TamperEvaluationResult;
    confirmed: boolean;
    consecutiveFrames: number;
    savedEvent: CameraTamperEventRecord | null;
  }> {
    const {
      tenantId,
      cameraId,
      branchId,
      frameBuffer,
      width,
      height,
      channels = 3,
      snapshotUrl,
      bypassDebounce = false,
    } = input;

    // 1. Fetch camera configuration and baseline
    const [config, baseline] = await Promise.all([
      this.repository.getConfig(tenantId, cameraId),
      this.repository.getBaseline(tenantId, cameraId),
    ]);

    if (!config.enabled) {
      const dummyMetrics: TamperMetrics = {
        luminance: 0,
        variance: 0,
        laplacianVariance: 0,
        edgeDensity: 0,
        entropy: 0,
        structuralSimilarity: 1.0,
        sceneChangeScore: 0.0,
        highlightFraction: 0,
        shadowFraction: 0,
      };
      return {
        evaluation: {
          isTampered: false,
          tamperType: null,
          severity: null,
          confidence: 0,
          metrics: dummyMetrics,
          reasons: ['Tamper detection is disabled for this camera.'],
          requiresAlert: false,
          observedAt: new Date(),
        },
        confirmed: false,
        consecutiveFrames: 0,
        savedEvent: null,
      };
    }

    // 2. Extract baseline luma if cached or available
    let baselineLuma = this.cachedBaselineLuma.get(`${tenantId}:${cameraId}`);

    // 3. Compute frame statistical metrics
    const { metrics, luma, frameHash } = TamperStatisticalAnalyzer.analyzeFrame(
      frameBuffer,
      width,
      height,
      channels,
      baselineLuma
    );

    // 4. Auto-initialize baseline if one does not exist yet
    if (!baseline) {
      await this.calibrateBaseline({
        tenantId,
        cameraId,
        luma,
        width,
        height,
        metrics,
        frameHash,
      });
    }

    // 5. Run diagnostic evaluation
    const evaluation = TamperStatisticalAnalyzer.evaluateTamper(metrics, {
      baseline,
      config,
      observedAt: new Date(),
    });

    // 6. Multi-frame debounce state machine
    const stateKey = `${tenantId}:${cameraId}`;
    let state = this.debounceStates.get(stateKey);
    if (!state) {
      state = {
        consecutiveCount: 0,
        tamperType: null,
        firstDetectedAt: new Date(),
      };
      this.debounceStates.set(stateKey, state);
    }

    let confirmed = false;
    let savedEvent: CameraTamperEventRecord | null = null;

    if (evaluation.isTampered && evaluation.tamperType) {
      if (state.tamperType === evaluation.tamperType) {
        state.consecutiveCount++;
      } else {
        state.tamperType = evaluation.tamperType;
        state.consecutiveCount = 1;
        state.firstDetectedAt = evaluation.observedAt;
      }

      const requiredFrames = bypassDebounce ? 1 : config.debounce_frames;
      if (state.consecutiveCount >= requiredFrames) {
        confirmed = true;

        // Persist confirmed tamper incident
        savedEvent = await this.repository.createEvent({
          tenant_id: tenantId,
          camera_id: cameraId,
          branch_id: branchId || null,
          tamper_type: evaluation.tamperType,
          severity: evaluation.severity || 'P2',
          confidence: evaluation.confidence,
          metrics: evaluation.metrics,
          status: 'detected',
          snapshot_url: snapshotUrl || null,
          detected_at: state.firstDetectedAt,
        });

        state.lastReportedEventId = savedEvent.id;

        // Emit real-time notification event
        this.emit('tamper_confirmed', {
          event: savedEvent,
          evaluation,
          reasons: evaluation.reasons,
        });
      }
    } else {
      // Frame is normal - decay or reset debounce counter
      if (state.consecutiveCount > 0) {
        state.consecutiveCount = Math.max(0, state.consecutiveCount - 1);
        if (state.consecutiveCount === 0) {
          state.tamperType = null;
        }
      }
    }

    return {
      evaluation,
      confirmed,
      consecutiveFrames: state.consecutiveCount,
      savedEvent,
    };
  }

  /**
   * Calibrate / store reference baseline for a camera
   */
  public async calibrateBaseline(params: {
    tenantId: string;
    cameraId: string;
    luma: Uint8Array;
    width: number;
    height: number;
    metrics: TamperMetrics;
    frameHash?: string;
  }): Promise<CameraTamperBaselineRecord> {
    const { tenantId, cameraId, luma, metrics, frameHash } = params;

    // Cache the luma for fast SSIM comparisons
    this.cachedBaselineLuma.set(`${tenantId}:${cameraId}`, luma);

    const stats = TamperStatisticalAnalyzer.computeLuminanceStats(luma);

    const record = await this.repository.upsertBaseline({
      tenant_id: tenantId,
      camera_id: cameraId,
      baseline_luminance: metrics.luminance,
      baseline_variance: metrics.variance,
      baseline_edge_density: metrics.edgeDensity,
      baseline_entropy: metrics.entropy,
      baseline_laplacian_variance: metrics.laplacianVariance,
      reference_frame_hash: frameHash || null,
      reference_histogram: stats.histogram,
      calibrated_at: new Date(),
      sample_frames_count: 1,
    });

    // Reset debounce state upon recalibration
    this.debounceStates.delete(`${tenantId}:${cameraId}`);

    this.emit('baseline_calibrated', { tenantId, cameraId, baseline: record });
    return record;
  }

  /**
   * Recalibrate camera baseline from raw buffer
   */
  public async recalibrateFromBuffer(
    tenantId: string,
    cameraId: string,
    frameBuffer: Uint8Array | Buffer,
    width: number,
    height: number,
    channels: 1 | 3 | 4 = 3
  ): Promise<CameraTamperBaselineRecord> {
    const { metrics, luma, frameHash } = TamperStatisticalAnalyzer.analyzeFrame(
      frameBuffer,
      width,
      height,
      channels
    );

    return this.calibrateBaseline({
      tenantId,
      cameraId,
      luma,
      width,
      height,
      metrics,
      frameHash,
    });
  }

  // Repository pass-through methods
  public async listEvents(filter: ListTamperEventsFilter) {
    return this.repository.listEvents(filter);
  }

  public async getEventById(tenantId: string, id: string) {
    return this.repository.getEventById(tenantId, id);
  }

  public async updateEventStatus(
    tenantId: string,
    id: string,
    status: TamperStatus,
    resolvedBy?: string,
    notes?: string
  ) {
    return this.repository.updateEventStatus(tenantId, id, status, resolvedBy, notes);
  }

  public async getBaseline(tenantId: string, cameraId: string) {
    return this.repository.getBaseline(tenantId, cameraId);
  }

  public async getConfig(tenantId: string, cameraId: string) {
    return this.repository.getConfig(tenantId, cameraId);
  }

  public async updateConfig(
    config: Partial<CameraTamperConfigRecord> & { tenant_id: string; camera_id: string }
  ) {
    return this.repository.upsertConfig(config);
  }

  public async getStats(tenantId: string, cameraId?: string) {
    return this.repository.getStats(tenantId, cameraId);
  }
}
