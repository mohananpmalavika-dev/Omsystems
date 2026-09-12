/**
 * Camera Tamper & Defocus Detection Domain Types
 * 
 * Defines the core models, enums, statistical metrics, and configuration
 * contracts for statistical frame analysis of camera tampering.
 */

export type TamperType = 'blinding' | 'covering' | 'movement' | 'defocus' | 'spray';

export type TamperSeverity = 'P1' | 'P2' | 'P3' | 'P4';

export type TamperStatus = 'detected' | 'acknowledged' | 'resolved' | 'false_positive';

export interface TamperMetrics {
  /** Average perceived luminance across frame (0-255) */
  luminance: number;
  /** Spatial luminance variance across pixels */
  variance: number;
  /** Discrete Laplacian variance (focus/sharpness quantification) */
  laplacianVariance: number;
  /** Normalized edge pixel density (0.0 - 1.0) */
  edgeDensity: number;
  /** Shannon entropy of the 256-bin luminance histogram (0.0 - 8.0) */
  entropy: number;
  /** Structural similarity score compared to baseline (0.0 - 1.0) */
  structuralSimilarity: number;
  /** Normalized L1 scene change distance compared to baseline (0.0 - 1.0) */
  sceneChangeScore: number;
  /** Fraction of pixels in saturated highlight (> 240) (0.0 - 1.0) */
  highlightFraction: number;
  /** Fraction of pixels in deep shadow (< 15) (0.0 - 1.0) */
  shadowFraction: number;
  /** Color saturation / chromatic deviation score (0.0 - 1.0) */
  colorShift?: number;
}

export interface TamperEvaluationResult {
  isTampered: boolean;
  tamperType: TamperType | null;
  severity: TamperSeverity | null;
  confidence: number;
  metrics: TamperMetrics;
  reasons: string[];
  requiresAlert: boolean;
  observedAt: Date;
}

export interface CameraTamperEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  branch_id?: string | null;
  tamper_type: TamperType;
  severity: TamperSeverity;
  confidence: number;
  metrics: TamperMetrics;
  status: TamperStatus;
  snapshot_url?: string | null;
  baseline_snapshot_url?: string | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  detected_at: Date;
  created_at: Date;
}

export interface CameraTamperBaselineRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  baseline_luminance: number;
  baseline_variance: number;
  baseline_edge_density: number;
  baseline_entropy: number;
  baseline_laplacian_variance: number;
  reference_frame_hash?: string | null;
  reference_histogram: number[];
  calibrated_at: Date;
  sample_frames_count: number;
  updated_at: Date;
}

export interface CameraTamperConfigRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  sensitivity: number;
  defocus_threshold: number;
  blinding_threshold: number;
  covering_threshold: number;
  movement_threshold: number;
  spray_threshold: number;
  debounce_frames: number;
  auto_recalibrate_hours: number;
  alert_on_defocus: boolean;
  alert_on_blinding: boolean;
  alert_on_covering: boolean;
  alert_on_movement: boolean;
  alert_on_spray: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ListTamperEventsFilter {
  tenantId: string;
  cameraId?: string;
  branchId?: string;
  tamperType?: TamperType;
  severity?: TamperSeverity;
  status?: TamperStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface TamperStats {
  totalEvents: number;
  activeEvents: number;
  byType: Record<TamperType, number>;
  bySeverity: Record<TamperSeverity, number>;
  byStatus: Record<TamperStatus, number>;
  camerasMonitored: number;
  camerasWithActiveTamper: number;
  lastEventAt?: string | null;
}
