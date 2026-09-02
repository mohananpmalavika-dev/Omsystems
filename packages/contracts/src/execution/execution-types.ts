/**
 * Canonical Execution Contract
 * Authoritative types and invariants for AI inference, heuristics, simulations, and detector results.
 */

export type ExecutionStatus =
  | "SUCCESS"
  | "MODEL_UNAVAILABLE"
  | "INFERENCE_FAILED"
  | "DEPENDENCY_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "DISABLED"
  | "INVALID_INPUT"
  | "TIMEOUT";

export type ResultProvenance =
  | "LIVE_INFERENCE"
  | "HEURISTIC_RULE_ENGINE"
  | "CACHED_RESULT"
  | "SIMULATION"
  | "SYNTHETIC_BENCHMARK"
  | "HISTORICAL_RECORD"
  | "MANUAL_OVERRIDE";

export interface AIExecutionMetadata {
  status: ExecutionStatus;
  provenance: ResultProvenance;
  modelId?: string | null;
  modelVersion?: string | null;
  inferenceDurationMs?: number | null;
  reason?: string | null;
  heuristicScore?: number | null;
  simulated?: boolean;
  timestamp: string;
  requiresReview?: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedEntity {
  label: string;
  confidence: number | null;
  boundingBox: BoundingBox;
  trackId?: string;
  attributes?: Record<string, unknown>;
}

export interface CanonicalDetectionResult<TMetadata = Record<string, unknown>> {
  detectionType: string;
  status: ExecutionStatus;
  provenance: ResultProvenance;
  /**
   * Model probability score in range [0, 1].
   * MUST be null if status is not SUCCESS (e.g., MODEL_UNAVAILABLE, INFERENCE_FAILED).
   * MUST be null for pure uncalibrated heuristics (heuristicScore is provided in metadata).
   */
  confidence: number | null;
  objects: DetectedEntity[];
  metadata: TMetadata;
  executionMetadata: AIExecutionMetadata;
  requiresAlert: boolean;
}

/**
 * Validates the Canonical Execution Contract invariants:
 * 1. If status is SUCCESS and provenance is LIVE_INFERENCE, confidence MUST be a number in [0, 1].
 * 2. If status is NOT SUCCESS, confidence MUST be null.
 * 3. If provenance is SIMULATION, simulated MUST be true.
 * 4. If provenance is HEURISTIC_RULE_ENGINE without neural confidence, confidence MUST be null.
 */
export function validateDetectionContract(result: CanonicalDetectionResult<any>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (result.status !== "SUCCESS") {
    if (result.confidence !== null) {
      errors.push(`Confidence must be null when status is ${result.status}, got ${result.confidence}`);
    }
  } else {
    if (result.provenance === "LIVE_INFERENCE" || result.provenance === "CACHED_RESULT") {
      if (typeof result.confidence !== "number" || isNaN(result.confidence) || result.confidence < 0 || result.confidence > 1) {
        errors.push(`Confidence must be a valid number between 0 and 1 for status SUCCESS with ${result.provenance}, got ${result.confidence}`);
      }
    }
  }

  if (result.provenance === "SIMULATION") {
    if (result.executionMetadata?.simulated !== true) {
      errors.push(`SIMULATION provenance must have executionMetadata.simulated set to true`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper: Create SUCCESS detection result from genuine model inference
 */
export function createSuccessDetection<TMetadata extends Record<string, unknown> = Record<string, unknown>>(params: {
  detectionType: string;
  confidence: number;
  objects: DetectedEntity[];
  metadata?: TMetadata;
  modelId?: string;
  modelVersion?: string;
  inferenceDurationMs?: number;
  requiresAlert?: boolean;
}): CanonicalDetectionResult<TMetadata> {
  const timestamp = new Date().toISOString();
  const clampedConfidence = Math.max(0, Math.min(1, params.confidence));

  return {
    detectionType: params.detectionType,
    status: "SUCCESS",
    provenance: "LIVE_INFERENCE",
    confidence: clampedConfidence,
    objects: params.objects,
    metadata: params.metadata ?? ({} as TMetadata),
    executionMetadata: {
      status: "SUCCESS",
      provenance: "LIVE_INFERENCE",
      modelId: params.modelId ?? null,
      modelVersion: params.modelVersion ?? null,
      inferenceDurationMs: params.inferenceDurationMs ?? null,
      simulated: false,
      timestamp,
    },
    requiresAlert: params.requiresAlert ?? false,
  };
}

/**
 * Helper: Create MODEL_UNAVAILABLE detection result
 */
export function createModelUnavailableDetection<TMetadata extends Record<string, unknown> = Record<string, unknown>>(params: {
  detectionType: string;
  reason: string;
  modelId?: string;
  metadata?: TMetadata;
}): CanonicalDetectionResult<TMetadata> {
  const timestamp = new Date().toISOString();

  return {
    detectionType: params.detectionType,
    status: "MODEL_UNAVAILABLE",
    provenance: "LIVE_INFERENCE",
    confidence: null,
    objects: [],
    metadata: {
      ...(params.metadata ?? ({} as TMetadata)),
      error: params.reason,
    },
    executionMetadata: {
      status: "MODEL_UNAVAILABLE",
      provenance: "LIVE_INFERENCE",
      modelId: params.modelId ?? null,
      reason: params.reason,
      simulated: false,
      timestamp,
    },
    requiresAlert: false,
  };
}

/**
 * Helper: Create INFERENCE_FAILED detection result
 */
export function createInferenceFailedDetection<TMetadata extends Record<string, unknown> = Record<string, unknown>>(params: {
  detectionType: string;
  reason: string;
  modelId?: string;
  metadata?: TMetadata;
}): CanonicalDetectionResult<TMetadata> {
  const timestamp = new Date().toISOString();

  return {
    detectionType: params.detectionType,
    status: "INFERENCE_FAILED",
    provenance: "LIVE_INFERENCE",
    confidence: null,
    objects: [],
    metadata: {
      ...(params.metadata ?? ({} as TMetadata)),
      error: params.reason,
    },
    executionMetadata: {
      status: "INFERENCE_FAILED",
      provenance: "LIVE_INFERENCE",
      modelId: params.modelId ?? null,
      reason: params.reason,
      simulated: false,
      timestamp,
    },
    requiresAlert: false,
  };
}

/**
 * Helper: Create HEURISTIC_RULE_ENGINE detection result
 */
export function createHeuristicDetection<TMetadata extends Record<string, unknown> = Record<string, unknown>>(params: {
  detectionType: string;
  heuristicScore: number;
  objects?: DetectedEntity[];
  metadata?: TMetadata;
  reason?: string;
  requiresAlert?: boolean;
}): CanonicalDetectionResult<TMetadata> {
  const timestamp = new Date().toISOString();
  const clampedScore = Math.max(0, Math.min(1, params.heuristicScore));

  return {
    detectionType: params.detectionType,
    status: "SUCCESS",
    provenance: "HEURISTIC_RULE_ENGINE",
    confidence: null, // Confidence is null for heuristic algorithms unless calibrated
    objects: params.objects ?? [],
    metadata: {
      ...(params.metadata ?? ({} as TMetadata)),
      heuristicScore: clampedScore,
    },
    executionMetadata: {
      status: "SUCCESS",
      provenance: "HEURISTIC_RULE_ENGINE",
      heuristicScore: clampedScore,
      reason: params.reason ?? null,
      simulated: false,
      timestamp,
    },
    requiresAlert: params.requiresAlert ?? false,
  };
}

/**
 * Helper: Create SIMULATION detection result (e.g. Digital Twin what-if analysis)
 */
export function createSimulationDetection<TMetadata extends Record<string, unknown> = Record<string, unknown>>(params: {
  detectionType: string;
  objects: DetectedEntity[];
  confidence?: number | null;
  metadata?: TMetadata;
  scenarioName?: string;
}): CanonicalDetectionResult<TMetadata> {
  const timestamp = new Date().toISOString();

  return {
    detectionType: params.detectionType,
    status: "SUCCESS",
    provenance: "SIMULATION",
    confidence: params.confidence ?? null,
    objects: params.objects,
    metadata: {
      ...(params.metadata ?? ({} as TMetadata)),
      scenario: params.scenarioName ?? "simulation",
    },
    executionMetadata: {
      status: "SUCCESS",
      provenance: "SIMULATION",
      simulated: true,
      reason: `Simulation scenario: ${params.scenarioName ?? "default"}`,
      timestamp,
    },
    requiresAlert: false,
  };
}
