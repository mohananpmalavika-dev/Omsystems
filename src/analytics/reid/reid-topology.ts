/**
 * Multi-Camera Topology & Spatio-Temporal Validator for Person Re-ID
 * 
 * Enforces physical transit constraints, adjacency graphs, walking velocity limits,
 * and temporal continuity across branch cameras to prevent false positive associations.
 */

export interface CameraTopologyEdge {
  fromCameraId: string;
  toCameraId: string;
  minTransitSeconds: number;
  maxTransitSeconds: number;
  distanceMeters?: number;
  transitionProbability: number;
  enabled: boolean;
}

export interface SpatioTemporalValidationResult {
  isFeasible: boolean;
  transitDurationSeconds: number;
  temporalScore: number;
  estimatedVelocityMps?: number;
  reason?: string;
  isSameCamera: boolean;
}

export interface PriorSightingContext {
  cameraId: string;
  cameraName?: string;
  exitedAt: Date;
  globalId: string;
}

export class ReidTopologyValidator {
  private readonly edges = new Map<string, CameraTopologyEdge>();
  private readonly defaultMinTransitSeconds: number;
  private readonly defaultMaxTransitSeconds: number;
  private readonly maxPhysicalVelocityMps: number; // Maximum indoor running speed (~6.0 m/s)

  constructor(options?: {
    defaultMinTransitSeconds?: number;
    defaultMaxTransitSeconds?: number;
    maxPhysicalVelocityMps?: number;
  }) {
    this.defaultMinTransitSeconds = options?.defaultMinTransitSeconds ?? 2;
    this.defaultMaxTransitSeconds = options?.defaultMaxTransitSeconds ?? 300;
    this.maxPhysicalVelocityMps = options?.maxPhysicalVelocityMps ?? 6.0;
  }

  /**
   * Register or update a directed edge between two cameras
   */
  public addEdge(edge: CameraTopologyEdge): void {
    const key = `${edge.fromCameraId}->${edge.toCameraId}`;
    this.edges.set(key, { ...edge });
  }

  /**
   * Bulk load topology edges
   */
  public loadEdges(edges: CameraTopologyEdge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  /**
   * Clear all loaded topology edges
   */
  public clearEdges(): void {
    this.edges.clear();
  }

  /**
   * Validate whether a transition from camera A to camera B at the given times is physically plausible.
   */
  public validateTransition(
    prior: PriorSightingContext,
    currentCameraId: string,
    currentEnteredAt: Date
  ): SpatioTemporalValidationResult {
    const isSameCamera = prior.cameraId === currentCameraId;
    const transitMs = currentEnteredAt.getTime() - prior.exitedAt.getTime();
    const transitSeconds = transitMs / 1000.0;

    // 1. Causal Chronology Check: Sighting B cannot occur before Sighting A ended (with 2s clock skew tolerance)
    if (transitSeconds < -2.0) {
      return {
        isFeasible: false,
        transitDurationSeconds: transitSeconds,
        temporalScore: 0.0,
        reason: `Causal inversion: new sighting at ${currentEnteredAt.toISOString()} preceded previous exit at ${prior.exitedAt.toISOString()} by ${Math.abs(transitSeconds).toFixed(1)}s`,
        isSameCamera,
      };
    }

    // 2. Same camera re-entry / continuous dwell
    if (isSameCamera) {
      // Re-appearance on the same camera is feasible
      // If gap is very short (< 15s), it's likely a momentary occlusion or missed track frame
      const temporalScore = transitSeconds <= 60 ? 1.0 : Math.max(0.5, 1.0 - (transitSeconds / 3600) * 0.5);
      return {
        isFeasible: true,
        transitDurationSeconds: Math.max(0, transitSeconds),
        temporalScore,
        isSameCamera: true,
      };
    }

    // 3. Different camera transition
    const key = `${prior.cameraId}->${currentCameraId}`;
    const edge = this.edges.get(key);

    const minTransit = edge?.enabled ? edge.minTransitSeconds : this.defaultMinTransitSeconds;
    const maxTransit = edge?.enabled ? edge.maxTransitSeconds : this.defaultMaxTransitSeconds;
    const distanceMeters = edge?.distanceMeters;

    // Check minimum transit time (prevent teleportation / impossible fast travel)
    if (transitSeconds < minTransit) {
      return {
        isFeasible: false,
        transitDurationSeconds: transitSeconds,
        temporalScore: 0.0,
        reason: `Impossible travel time: ${transitSeconds.toFixed(1)}s elapsed between cameras, minimum required is ${minTransit}s`,
        isSameCamera: false,
      };
    }

    // Check physical velocity limit if physical distance is calibrated
    let velocity: number | undefined;
    if (distanceMeters !== undefined && distanceMeters > 0 && transitSeconds > 0) {
      velocity = distanceMeters / transitSeconds;
      if (velocity > this.maxPhysicalVelocityMps) {
        return {
          isFeasible: false,
          transitDurationSeconds: transitSeconds,
          estimatedVelocityMps: velocity,
          temporalScore: 0.0,
          reason: `Required travel velocity (${velocity.toFixed(2)} m/s) exceeds maximum human indoor running speed (${this.maxPhysicalVelocityMps} m/s)`,
          isSameCamera: false,
        };
      }
    }

    // Compute temporal likelihood score
    // Ideal window: between minTransit and maxTransit
    let temporalScore = 1.0;
    if (transitSeconds <= maxTransit) {
      // High score inside calibrated transit window, scaled by edge transition probability
      const priorProb = edge?.transitionProbability ?? 1.0;
      temporalScore = 0.8 + 0.2 * priorProb;
    } else {
      // Gradual decay beyond maxTransit (person could have dwelled in hallway or restroom)
      const overstayFactor = (transitSeconds - maxTransit) / (maxTransit * 2);
      temporalScore = Math.max(0.2, 0.8 * Math.exp(-overstayFactor));
    }

    return {
      isFeasible: true,
      transitDurationSeconds: transitSeconds,
      temporalScore,
      estimatedVelocityMps: velocity,
      isSameCamera: false,
    };
  }

  /**
   * Combine visual similarity and spatio-temporal likelihood into an integrated match score
   */
  public computeIntegratedScore(
    visualSimilarity: number,
    validation: SpatioTemporalValidationResult,
    visualWeight: number = 0.80
  ): number {
    if (!validation.isFeasible) {
      return 0.0;
    }

    // High visual similarity (> 0.90) gets priority, but temporal score adjusts marginal matches
    const score = visualWeight * visualSimilarity + (1 - visualWeight) * validation.temporalScore;
    return Math.max(0.0, Math.min(1.0, score));
  }
}
