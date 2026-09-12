/**
 * Camera Obstruction & Dark Frame Detection Domain Types
 * 
 * Defines the core models, enums, statistical metrics, spatial tile grids,
 * and configuration contracts for heuristic camera obstruction detection.
 */

export type ObstructionType =
  | 'dark_frame'
  | 'lens_covering'
  | 'variance_loss'
  | 'partial_obstruction'
  | 'glare_whiteout';

export type ObstructionSeverity = 'P1' | 'P2' | 'P3' | 'P4';

export type ObstructionStatus = 'detected' | 'acknowledged' | 'resolved' | 'false_positive';

export interface TileMetric {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  luminance: number;
  variance: number;
  edgeScore: number;
  isObstructed: boolean;
  obstructionReason?: string;
}

export interface TileBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileAnalysis {
  gridRows: number;
  gridCols: number;
  totalTiles: number;
  obstructedTiles: number;
  obstructionPercent: number;
  tiles: TileMetric[];
  obstructedBoundingBox?: TileBoundingBox | null;
}

export interface ObstructionMetrics {
  /** Average ITU-R BT.601 perceived luminance (0-255) */
  luminance: number;
  /** Global spatial luminance variance across all pixels */
  variance: number;
  /** Global normalized edge pixel density (0.0 - 1.0) */
  edgeDensity: number;
  /** Shannon entropy of the 256-bin luminance histogram (0.0 - 8.0) */
  entropy: number;
  /** Discrete Laplacian variance (focus/high-frequency energy) */
  laplacianVariance: number;
  /** Fraction of pixels in deep shadow (<= 12) (0.0 - 1.0) */
  shadowFraction: number;
  /** Fraction of pixels in saturated highlight (>= 240) (0.0 - 1.0) */
  highlightFraction: number;
  /** Percentage of spatial grid tiles classified as obstructed (0.0 - 100.0) */
  obstructionPercent: number;
  /** Detailed multi-tile spatial breakdown */
  tileAnalysis: TileAnalysis;
  /** 256-bin histogram */
  histogram?: number[];
}

export interface ObstructionEvaluationResult {
  isObstructed: boolean;
  obstructionType: ObstructionType | null;
  severity: ObstructionSeverity | null;
  confidence: number;
  metrics: ObstructionMetrics;
  reasons: string[];
  requiresAlert: boolean;
  observedAt: Date;
}

export interface CameraObstructionEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  branch_id?: string | null;
  obstruction_type: ObstructionType;
  severity: ObstructionSeverity;
  confidence: number;
  obstruction_percent: number;
  metrics: ObstructionMetrics;
  tile_analysis: TileAnalysis;
  status: ObstructionStatus;
  snapshot_url?: string | null;
  baseline_snapshot_url?: string | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  detected_at: Date;
  created_at: Date;
}

export interface TileBaselineItem {
  row: number;
  col: number;
  luminance: number;
  variance: number;
}

export interface CameraObstructionBaselineRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  baseline_luminance: number;
  baseline_variance: number;
  baseline_edge_density: number;
  baseline_entropy: number;
  baseline_laplacian_variance: number;
  tile_baselines: TileBaselineItem[];
  reference_histogram: number[];
  reference_frame_hash?: string | null;
  calibrated_at: Date;
  sample_frames_count: number;
  updated_at: Date;
}

export interface CameraObstructionConfigRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  sensitivity: number;
  darkness_threshold: number;
  variance_floor: number;
  obstruction_percent_threshold: number;
  partial_threshold: number;
  debounce_frames: number;
  auto_recalibrate_hours: number;
  alert_on_dark_frame: boolean;
  alert_on_covering: boolean;
  alert_on_variance_loss: boolean;
  alert_on_partial: boolean;
  alert_on_glare: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ListObstructionEventsFilter {
  tenantId: string;
  cameraId?: string;
  branchId?: string;
  obstructionType?: ObstructionType;
  severity?: ObstructionSeverity;
  status?: ObstructionStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ObstructionStats {
  totalEvents: number;
  activeEvents: number;
  darkFrameCount: number;
  lensCoveringCount: number;
  varianceLossCount: number;
  partialObstructionCount: number;
  glareWhiteoutCount: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  p4Count: number;
  acknowledgedCount: number;
  resolvedCount: number;
  falsePositiveCount: number;
  camerasMonitored: number;
  camerasAtRisk: number;
  lastEventAt?: Date | null;
}
