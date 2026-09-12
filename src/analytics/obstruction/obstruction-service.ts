/**
 * Camera Obstruction & Dark Frame Detection Service
 * 
 * Production service layer coordinating:
 * 1. Multi-frame temporal debouncing to eliminate false alarms from transient shadows or objects
 * 2. Baseline optical profile calibration and deviation monitoring
 * 3. Event persistence, security status transitions, and fleet telemetry aggregation
 */

import type { Pool } from 'pg';
import { ObstructionRepository } from './obstruction-repository.js';
import {
  ObstructionHeuristicAnalyzer,
  type FrameDimensions,
} from './obstruction-heuristic-analyzer.js';
import type {
  CameraObstructionEventRecord,
  CameraObstructionBaselineRecord,
  CameraObstructionConfigRecord,
  ObstructionEvaluationResult,
  ObstructionType,
  ObstructionStatus,
  ListObstructionEventsFilter,
  ObstructionStats,
} from './obstruction-types.js';

export interface FrameIngestionPayload {
  tenantId: string;
  cameraId: string;
  branchId?: string | null;
  buffer: Uint8Array | Buffer;
  dimensions: FrameDimensions;
  bypassDebounce?: boolean;
  snapshotUrl?: string | null;
}

interface CameraDebounceState {
  obstructionType: ObstructionType | null;
  consecutiveCount: number;
  lastEvaluatedAt: Date;
  activeConfirmedEventId?: string | null;
}

export class ObstructionService {
  private readonly repository: ObstructionRepository;
  private readonly debounceMap = new Map<string, CameraDebounceState>();

  constructor(poolOrRepo?: Pool | ObstructionRepository) {
    if (poolOrRepo && 'createEvent' in poolOrRepo) {
      this.repository = poolOrRepo as ObstructionRepository;
    } else {
      this.repository = new ObstructionRepository(poolOrRepo as Pool | undefined);
    }
  }

  public getRepository(): ObstructionRepository {
    return this.repository;
  }

  /**
   * Process a single video frame with heuristic detection and multi-frame debouncing
   */
  async ingestAndAnalyzeFrame(payload: FrameIngestionPayload): Promise<{
    evaluation: ObstructionEvaluationResult;
    confirmed: boolean;
    consecutiveFrames: number;
    savedEvent: CameraObstructionEventRecord | null;
  }> {
    const { tenantId, cameraId, branchId, buffer, dimensions, bypassDebounce, snapshotUrl } = payload;
    const { width, height, channels = 3 } = dimensions;

    // 1. Fetch camera configuration and calibrated baseline
    const [config, baseline] = await Promise.all([
      this.repository.getConfig(tenantId, cameraId),
      this.repository.getBaseline(tenantId, cameraId),
    ]);

    if (config && !config.enabled) {
      return {
        evaluation: {
          isObstructed: false,
          obstructionType: null,
          severity: null,
          confidence: 0,
          metrics: {
            luminance: 0,
            variance: 0,
            edgeDensity: 0,
            entropy: 0,
            laplacianVariance: 0,
            shadowFraction: 0,
            highlightFraction: 0,
            obstructionPercent: 0,
            tileAnalysis: {
              gridRows: 4,
              gridCols: 4,
              totalTiles: 16,
              obstructedTiles: 0,
              obstructionPercent: 0,
              tiles: [],
            },
          },
          reasons: ['Obstruction detection is administratively disabled for this camera'],
          requiresAlert: false,
          observedAt: new Date(),
        },
        confirmed: false,
        consecutiveFrames: 0,
        savedEvent: null,
      };
    }

    // 2. Perform heuristic frame analysis
    const evaluation = ObstructionHeuristicAnalyzer.analyzeFrame(
      buffer,
      width,
      height,
      channels,
      {
        dimensions,
        baseline,
        config: config || undefined,
      }
    );

    // 3. Multi-Frame Temporal Debouncing
    const debounceKey = `${tenantId}:${cameraId}`;
    let debounceState = this.debounceMap.get(debounceKey);
    if (!debounceState) {
      debounceState = {
        obstructionType: null,
        consecutiveCount: 0,
        lastEvaluatedAt: new Date(),
      };
      this.debounceMap.set(debounceKey, debounceState);
    }

    const requiredDebounceFrames = bypassDebounce ? 1 : (config?.debounce_frames ?? 3);
    let confirmed = false;
    let savedEvent: CameraObstructionEventRecord | null = null;

    if (evaluation.isObstructed && evaluation.obstructionType) {
      if (debounceState.obstructionType === evaluation.obstructionType) {
        debounceState.consecutiveCount++;
      } else {
        debounceState.obstructionType = evaluation.obstructionType;
        debounceState.consecutiveCount = 1;
      }
      debounceState.lastEvaluatedAt = new Date();

      // Check if debounce threshold met
      if (debounceState.consecutiveCount >= requiredDebounceFrames) {
        confirmed = true;

        // Persist confirmed incident event
        savedEvent = await this.repository.createEvent({
          tenant_id: tenantId,
          camera_id: cameraId,
          branch_id: branchId || null,
          obstruction_type: evaluation.obstructionType,
          severity: evaluation.severity || 'P2',
          confidence: evaluation.confidence,
          obstruction_percent: evaluation.metrics.obstructionPercent,
          metrics: evaluation.metrics,
          tile_analysis: evaluation.metrics.tileAnalysis,
          status: 'detected',
          snapshot_url: snapshotUrl || null,
          baseline_snapshot_url: null,
          notes: evaluation.reasons.join('; '),
          detected_at: evaluation.observedAt,
        });

        debounceState.activeConfirmedEventId = savedEvent.id;
      }
    } else {
      // Normal frame - reset or resolve open anomaly
      if (debounceState.consecutiveCount > 0) {
        debounceState.consecutiveCount = 0;
        debounceState.obstructionType = null;
      }
    }

    return {
      evaluation,
      confirmed,
      consecutiveFrames: debounceState.consecutiveCount,
      savedEvent,
    };
  }

  /**
   * Calibrate optical baseline for a camera from a known clear frame
   */
  async recalibrateBaseline(
    tenantId: string,
    cameraId: string,
    buffer?: Uint8Array | Buffer,
    dimensions?: FrameDimensions
  ): Promise<CameraObstructionBaselineRecord> {
    const now = new Date();

    if (buffer && dimensions && dimensions.width > 0 && dimensions.height > 0) {
      const { width, height, channels = 3 } = dimensions;
      const luma = ObstructionHeuristicAnalyzer.extractLuma(buffer, width, height, channels);
      const tileAnalysis = ObstructionHeuristicAnalyzer.computeTileAnalysis(luma, width, height, 4, 4);
      const metrics = ObstructionHeuristicAnalyzer.computeGlobalMetrics(luma, width, height, tileAnalysis);
      const hash = ObstructionHeuristicAnalyzer.hashFrame(buffer);

      const tileBaselines = tileAnalysis.tiles.map((t) => ({
        row: t.row,
        col: t.col,
        luminance: t.luminance,
        variance: t.variance,
      }));

      return this.repository.upsertBaseline({
        tenant_id: tenantId,
        camera_id: cameraId,
        baseline_luminance: metrics.luminance,
        baseline_variance: metrics.variance,
        baseline_edge_density: metrics.edgeDensity,
        baseline_entropy: metrics.entropy,
        baseline_laplacian_variance: metrics.laplacianVariance,
        tile_baselines: tileBaselines,
        reference_histogram: metrics.histogram || [],
        reference_frame_hash: hash,
        calibrated_at: now,
        sample_frames_count: 1,
      });
    }

    // Default nominal clear-room baseline
    return this.repository.upsertBaseline({
      tenant_id: tenantId,
      camera_id: cameraId,
      baseline_luminance: 120.0,
      baseline_variance: 45.0,
      baseline_edge_density: 0.08,
      baseline_entropy: 6.2,
      baseline_laplacian_variance: 150.0,
      tile_baselines: [],
      reference_histogram: [],
      reference_frame_hash: null,
      calibrated_at: now,
      sample_frames_count: 1,
    });
  }

  /**
   * List historical events with filtering
   */
  async listEvents(
    filter: ListObstructionEventsFilter
  ): Promise<{ events: CameraObstructionEventRecord[]; total: number }> {
    return this.repository.listEvents(filter);
  }

  /**
   * Get single event by ID
   */
  async getEventById(tenantId: string, id: string): Promise<CameraObstructionEventRecord | null> {
    return this.repository.getEventById(tenantId, id);
  }

  /**
   * Update event review status (acknowledged, resolved, false_positive)
   */
  async updateEventStatus(
    tenantId: string,
    id: string,
    status: ObstructionStatus,
    resolvedBy?: string,
    notes?: string
  ): Promise<CameraObstructionEventRecord | null> {
    return this.repository.updateEventStatus(tenantId, id, status, resolvedBy, notes);
  }

  /**
   * Ingest event directly from edge-agent or telemetry gateway
   */
  async ingestTelemetryEvent(
    data: Omit<CameraObstructionEventRecord, 'id' | 'created_at'>
  ): Promise<CameraObstructionEventRecord> {
    return this.repository.createEvent(data);
  }

  /**
   * Fleet optical health statistics
   */
  async getStats(tenantId: string, cameraId?: string): Promise<ObstructionStats> {
    return this.repository.getStats(tenantId, cameraId);
  }

  /**
   * Get baseline
   */
  async getBaseline(tenantId: string, cameraId: string): Promise<CameraObstructionBaselineRecord | null> {
    return this.repository.getBaseline(tenantId, cameraId);
  }

  /**
   * Get camera configuration
   */
  async getConfig(tenantId: string, cameraId: string): Promise<CameraObstructionConfigRecord | null> {
    return this.repository.getConfig(tenantId, cameraId);
  }

  /**
   * Update camera configuration
   */
  async updateConfig(
    tenantId: string,
    cameraId: string,
    updates: Partial<CameraObstructionConfigRecord>
  ): Promise<CameraObstructionConfigRecord> {
    return this.repository.upsertConfig({
      ...updates,
      tenant_id: tenantId,
      camera_id: cameraId,
    });
  }
}
