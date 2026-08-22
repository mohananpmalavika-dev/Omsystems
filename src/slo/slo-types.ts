/**
 * VMS SLO Engine — Type Contracts
 *
 * Distinct from src/sla/ (historical availability roll-ups per camera/branch).
 * This layer defines real-time, platform-level latency/coverage/count SLOs
 * with rolling windows, error budgets, and violation detection.
 */

// ─── SLO Identifiers ────────────────────────────────────────────────────────

export type SloId =
  | "CAMERA_RECONNECT_P50"
  | "MEDIA_NODE_FAILOVER_P99"
  | "RECORDING_GAP_ON_RESTART"
  | "LIVE_VIEW_STARTUP_LAN"
  | "LIVE_VIEW_STARTUP_WAN"
  | "PLAYBACK_STARTUP"
  | "TIMELINE_QUERY"
  | "ALERT_PROPAGATION"
  | "RECORDING_COVERAGE"
  | "CONTROL_PLANE_AVAILABILITY"
  | "CRITICAL_AUDIT_LOSS";

// ─── SLO Kind ────────────────────────────────────────────────────────────────

/**
 * LATENCY_P50_MS  – median latency must be ≤ targetMs
 * LATENCY_P99_MS  – 99th-percentile latency must be ≤ targetMs
 * AVAILABILITY_PCT – success rate over window must be ≥ targetPct (0–100)
 * COUNT_ZERO       – total bad samples in window must equal 0
 */
export type SloKind =
  | "LATENCY_P50_MS"
  | "LATENCY_P99_MS"
  | "AVAILABILITY_PCT"
  | "COUNT_ZERO";

// ─── SLO Definition ──────────────────────────────────────────────────────────

export interface SloDefinition {
  /** Unique identifier — one of the canonical VMS SLOs */
  id: SloId;

  /** Human-readable name for dashboards and reports */
  name: string;

  /** Measurement kind — determines which target field is used */
  kind: SloKind;

  /**
   * For LATENCY_* kinds: the threshold in milliseconds.
   * A measurement is "good" if valueMs ≤ targetMs.
   */
  targetMs?: number;

  /**
   * For AVAILABILITY_PCT: minimum required success rate (0–100).
   * A measurement is "good" if success === true.
   * The window success-rate must be ≥ targetPct.
   */
  targetPct?: number;

  /**
   * Rolling window length in seconds over which the SLO is evaluated.
   * Default: 3600 (1 hour) for latency SLOs, 86400 (24 h) for availability SLOs.
   */
  windowSeconds: number;

  /**
   * Percentage of "bad" observations that are tolerated before a violation
   * is raised.  Derived from the complement of the target.
   *
   * Examples:
   *   RECORDING_COVERAGE  targetPct=99.99 → errorBudgetPct = 0.01
   *   CONTROL_PLANE       targetPct=99.95 → errorBudgetPct = 0.05
   *   Latency SLOs        targetMs=2000   → errorBudgetPct = 1.0 (1% bad samples allowed)
   *   CRITICAL_AUDIT_LOSS                 → errorBudgetPct = 0   (zero tolerance)
   */
  errorBudgetPct: number;

  /** One-sentence description shown in the definition catalogue */
  description: string;
}

// ─── Measurement Sample ───────────────────────────────────────────────────────

export interface SloMeasurement {
  /** Which SLO this sample belongs to */
  sloId: SloId;

  /** Wall-clock time when the operation completed */
  observedAt: Date;

  /**
   * Duration in milliseconds (required for LATENCY_* SLOs).
   * Omit for AVAILABILITY_PCT and COUNT_ZERO SLOs.
   */
  valueMs?: number;

  /**
   * Whether this observation satisfied the SLO:
   *   LATENCY_*       → valueMs <= targetMs
   *   AVAILABILITY_PCT → operation succeeded
   *   COUNT_ZERO       → no audit record was lost (true = 0 lost)
   */
  success: boolean;

  /** Optional key-value bag for debugging/filtering (cameraId, nodeId, etc.) */
  context?: Record<string, string>;
}

// ─── Computed Window ─────────────────────────────────────────────────────────

export interface SloWindow {
  sloId: SloId;

  /** The inclusive start of the rolling window */
  windowStart: Date;

  /** The exclusive end of the rolling window (usually `now`) */
  windowEnd: Date;

  totalSamples: number;
  goodSamples: number;
  badSamples: number;

  /** Median latency across good+bad samples (present for LATENCY_* SLOs) */
  p50Ms?: number;

  /** 99th-percentile latency (present for LATENCY_* SLOs) */
  p99Ms?: number;

  /**
   * What percentage of the error budget has been consumed (0–100+).
   * > 100 means the budget is exhausted (violation).
   */
  errorBudgetUsedPct: number;

  /** 100 - errorBudgetUsedPct, clamped to 0 */
  errorBudgetRemainingPct: number;

  status: SloStatus;
}

export type SloStatus = "OK" | "WARNING" | "BREACH" | "INSUFFICIENT_DATA";

// ─── Violation ───────────────────────────────────────────────────────────────

export interface SloViolation {
  sloId: SloId;
  sloName: string;
  detectedAt: Date;
  errorBudgetUsedPct: number;
  badSamples: number;
  totalSamples: number;
  context?: Record<string, string>;
}

// ─── Dashboard Report ─────────────────────────────────────────────────────────

export interface SloReport {
  generatedAt: Date;
  overall: "ALL_GREEN" | "WARNING" | "BREACH";
  slos: SloWindow[];
  violations: SloViolation[];
  errorBudgetSummary: Array<{
    sloId: SloId;
    sloName: string;
    remainingPct: number;
    status: SloStatus;
  }>;
}
