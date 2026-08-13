/**
 * Twin Observation Domain Model
 * 
 * Represents live telemetry and state observations from various sources.
 * Observations have freshness tracking and expiry to prevent stale data
 * from being treated as current.
 */

/**
 * Source of the observation
 */
export type TwinObservationSource =
  | 'ONVIF'              // ONVIF device queries
  | 'SNMP'               // SNMP polling
  | 'RTSP'               // RTSP stream checks
  | 'HTTP_API'           // HTTP API queries
  | 'EDGE_AGENT'         // Edge agent reports
  | 'NVR_API'            // NVR/DVR API
  | 'PING'               // ICMP ping
  | 'SECURITY_COLLECTOR' // Security posture collector
  | 'RECORDING_VERIFIER' // Recording verification service
  | 'TPM_ATTESTATION'    // TPM attestation service
  | 'ANALYTICS_ENGINE'   // Analytics engine reports
  | 'MANUAL'             // Manual operator input
  | 'SYNTHETIC';         // Synthetic monitoring

/**
 * Metric type being observed
 */
export type TwinObservationMetric =
  // Connectivity
  | 'connectivity'
  | 'network_latency'
  | 'packet_loss'
  
  // Video
  | 'video_stream'
  | 'video_quality'
  | 'frame_rate'
  | 'bitrate'
  | 'resolution'
  
  // Recording
  | 'recording_active'
  | 'recording_quality'
  | 'storage_writing'
  
  // Storage
  | 'disk_health'
  | 'disk_temperature'
  | 'disk_usage'
  | 'raid_status'
  | 'storage_capacity'
  
  // Power
  | 'power_status'
  | 'battery_level'
  | 'voltage'
  | 'current'
  
  // Performance
  | 'cpu_usage'
  | 'memory_usage'
  | 'disk_io'
  | 'network_throughput'
  
  // Security
  | 'firmware_version'
  | 'certificate_status'
  | 'tls_version'
  | 'authentication_status'
  | 'encryption_status'
  | 'secure_boot'
  | 'tpm_attestation'
  
  // Environmental
  | 'temperature'
  | 'humidity'
  | 'motion'
  | 'tamper'
  
  // Analytics
  | 'analytics_active'
  | 'detection_count'
  | 'model_health'
  
  // System
  | 'uptime'
  | 'time_sync'
  | 'service_status';

/**
 * State interpretation of the observation
 */
export type TwinObservationState =
  | 'HEALTHY'      // All normal
  | 'DEGRADED'     // Operational but with issues
  | 'FAILED'       // Not operational
  | 'UNKNOWN';     // Cannot determine state

/**
 * Canonical Twin Observation
 * 
 * Represents a point-in-time observation of a node's state
 */
export interface TwinObservation {
  /** Unique observation identifier */
  id: string;
  
  /** Multi-tenant scope */
  tenantId: string;
  
  /** Node being observed */
  nodeId: string;
  
  /** Metric being measured */
  metric: TwinObservationMetric;
  
  /** Interpreted state from this observation */
  state: TwinObservationState;
  
  /** Raw value (number, string, boolean, or object) */
  value?: unknown;
  
  /** Units for numeric values */
  units?: string;
  
  /** Source that produced this observation */
  source: TwinObservationSource;
  
  /** Confidence in this observation (0.0 to 1.0) */
  confidence: number;
  
  /** When was this observed? */
  observedAt: Date;
  
  /** When does this observation expire? */
  expiresAt: Date;
  
  /** Is this observation still fresh? */
  isFresh?: boolean;
  
  /** Additional context */
  metadata?: {
    /** Source-specific details */
    sourceDetails?: Record<string, unknown>;
    
    /** Method used to collect */
    collectionMethod?: string;
    
    /** Collector ID */
    collectorId?: string;
    
    /** Error if observation failed */
    error?: string;
    
    /** Warnings */
    warnings?: string[];
  };
  
  /** Timestamps */
  createdAt: Date;
}

/**
 * Observation freshness policy
 * 
 * Defines how long different observation types remain valid
 */
export interface ObservationFreshnessPolicy {
  metric: TwinObservationMetric;
  freshnessDuration: number; // milliseconds
  staleGracePeriod?: number;  // milliseconds before marking as UNKNOWN
}

/**
 * Default freshness policies (in milliseconds)
 */
export const DEFAULT_FRESHNESS_POLICIES: Record<string, number> = {
  // Connectivity - stale after 60 seconds
  connectivity: 60_000,
  network_latency: 60_000,
  packet_loss: 300_000,
  
  // Video - stale after 30 seconds
  video_stream: 30_000,
  video_quality: 60_000,
  frame_rate: 60_000,
  bitrate: 60_000,
  
  // Recording - stale after 2 minutes
  recording_active: 120_000,
  recording_quality: 300_000,
  
  // Storage - stale after 5 minutes
  disk_health: 300_000,
  disk_temperature: 300_000,
  disk_usage: 300_000,
  raid_status: 300_000,
  storage_capacity: 600_000,
  
  // Power - stale after 2 minutes
  power_status: 120_000,
  battery_level: 300_000,
  voltage: 120_000,
  
  // Performance - stale after 60 seconds
  cpu_usage: 60_000,
  memory_usage: 60_000,
  disk_io: 60_000,
  network_throughput: 60_000,
  
  // Security - stale after 1 hour
  firmware_version: 3_600_000,
  certificate_status: 3_600_000,
  tls_version: 3_600_000,
  authentication_status: 300_000,
  encryption_status: 3_600_000,
  secure_boot: 3_600_000,
  tpm_attestation: 600_000,
  
  // Environmental - stale after 5 minutes
  temperature: 300_000,
  humidity: 300_000,
  motion: 60_000,
  tamper: 60_000,
  
  // Analytics - stale after 60 seconds
  analytics_active: 60_000,
  detection_count: 300_000,
  model_health: 300_000,
  
  // System - varies
  uptime: 600_000,
  time_sync: 3_600_000,
  service_status: 120_000
};

/**
 * Create a new observation
 */
export function createTwinObservation(
  id: string,
  tenantId: string,
  nodeId: string,
  metric: TwinObservationMetric,
  state: TwinObservationState,
  source: TwinObservationSource,
  options?: {
    value?: unknown;
    units?: string;
    confidence?: number;
    observedAt?: Date;
    freshnessDuration?: number;
    metadata?: TwinObservation['metadata'];
  }
): TwinObservation {
  const now = new Date();
  const observedAt = options?.observedAt ?? now;
  
  // Determine freshness duration
  const freshnessDuration = options?.freshnessDuration ?? 
    DEFAULT_FRESHNESS_POLICIES[metric] ?? 
    300_000; // Default 5 minutes
  
  const expiresAt = new Date(observedAt.getTime() + freshnessDuration);
  
  return {
    id,
    tenantId,
    nodeId,
    metric,
    state,
    value: options?.value,
    units: options?.units,
    source,
    confidence: options?.confidence ?? 1.0,
    observedAt,
    expiresAt,
    isFresh: now < expiresAt,
    metadata: options?.metadata,
    createdAt: now
  };
}

/**
 * Check if observation is still fresh
 */
export function isObservationFresh(observation: TwinObservation, at: Date = new Date()): boolean {
  return at < observation.expiresAt;
}

/**
 * Check if observation is stale
 */
export function isObservationStale(observation: TwinObservation, at: Date = new Date()): boolean {
  return at >= observation.expiresAt;
}

/**
 * Get observation age in milliseconds
 */
export function getObservationAge(observation: TwinObservation, at: Date = new Date()): number {
  return at.getTime() - observation.observedAt.getTime();
}

/**
 * Get time until observation expires (negative if already expired)
 */
export function getTimeUntilExpiry(observation: TwinObservation, at: Date = new Date()): number {
  return observation.expiresAt.getTime() - at.getTime();
}

/**
 * Calculate effective state considering freshness
 * 
 * Stale observations should be treated as UNKNOWN rather than their
 * reported state
 */
export function getEffectiveState(
  observation: TwinObservation,
  at: Date = new Date()
): TwinObservationState {
  if (isObservationStale(observation, at)) {
    return 'UNKNOWN';
  }
  
  return observation.state;
}

/**
 * Multiple observations for the same metric
 */
export interface ObservationSet {
  nodeId: string;
  metric: TwinObservationMetric;
  observations: TwinObservation[];
  
  /** Consensus state from all observations */
  consensusState: TwinObservationState;
  
  /** Confidence in consensus */
  consensusConfidence: number;
  
  /** Most recent observation */
  latest?: TwinObservation;
  
  /** Highest confidence observation */
  mostConfident?: TwinObservation;
  
  /** Freshness status */
  hasFreshObservations: boolean;
  allObservationsFresh: boolean;
  
  /** Conflicts between sources */
  hasConflicts: boolean;
  conflictDetails?: string[];
}

/**
 * Correlate multiple observations for the same metric
 */
export function correlateObservations(
  nodeId: string,
  metric: TwinObservationMetric,
  observations: TwinObservation[],
  at: Date = new Date()
): ObservationSet {
  if (observations.length === 0) {
    return {
      nodeId,
      metric,
      observations: [],
      consensusState: 'UNKNOWN',
      consensusConfidence: 0,
      hasFreshObservations: false,
      allObservationsFresh: false,
      hasConflicts: false
    };
  }
  
  // Filter to fresh observations only
  const freshObservations = observations.filter(obs => isObservationFresh(obs, at));
  const hasFreshObservations = freshObservations.length > 0;
  const allObservationsFresh = freshObservations.length === observations.length;
  
  // Use fresh observations if available, otherwise fall back to all
  const relevantObservations = hasFreshObservations ? freshObservations : observations;
  
  // Find latest and most confident
  const latest = relevantObservations.reduce((newest, obs) => 
    obs.observedAt > newest.observedAt ? obs : newest
  );
  
  const mostConfident = relevantObservations.reduce((best, obs) =>
    obs.confidence > best.confidence ? obs : best
  );
  
  // Calculate consensus
  const stateCounts = new Map<TwinObservationState, number>();
  let totalConfidence = 0;
  
  for (const obs of relevantObservations) {
    const weight = obs.confidence;
    stateCounts.set(obs.state, (stateCounts.get(obs.state) ?? 0) + weight);
    totalConfidence += weight;
  }
  
  // Find consensus state (weighted majority)
  let consensusState: TwinObservationState = 'UNKNOWN';
  let maxWeight = 0;
  
  for (const [state, weight] of stateCounts.entries()) {
    if (weight > maxWeight) {
      maxWeight = weight;
      consensusState = state;
    }
  }
  
  const consensusConfidence = totalConfidence > 0 ? maxWeight / totalConfidence : 0;
  
  // Detect conflicts
  const uniqueStates = new Set(relevantObservations.map(obs => obs.state));
  const hasConflicts = uniqueStates.size > 1;
  
  const conflictDetails = hasConflicts
    ? Array.from(stateCounts.entries()).map(([state, weight]) =>
        `${state}: ${((weight / totalConfidence) * 100).toFixed(0)}% (${
          relevantObservations.filter(obs => obs.state === state).map(obs => obs.source).join(', ')
        })`
      )
    : undefined;
  
  // If no fresh observations, downgrade confidence
  const effectiveConfidence = hasFreshObservations 
    ? consensusConfidence 
    : consensusConfidence * 0.5;
  
  return {
    nodeId,
    metric,
    observations: relevantObservations,
    consensusState,
    consensusConfidence: effectiveConfidence,
    latest,
    mostConfident,
    hasFreshObservations,
    allObservationsFresh,
    hasConflicts,
    conflictDetails
  };
}

/**
 * Aggregate observations into node state
 */
export interface NodeStateFromObservations {
  nodeId: string;
  
  /** Overall operational state */
  operationalState: TwinObservationState;
  
  /** When was this state determined? */
  determinedAt: Date;
  
  /** Confidence in this state assessment */
  confidence: number;
  
  /** Contributing observations */
  observations: {
    metric: TwinObservationMetric;
    state: TwinObservationState;
    source: TwinObservationSource;
    observedAt: Date;
    fresh: boolean;
  }[];
  
  /** Issues detected */
  issues: string[];
  
  /** Stale metrics (no fresh observations) */
  staleMetrics: TwinObservationMetric[];
  
  /** Conflicting observations */
  conflicts: string[];
}

/**
 * Determine node operational state from observations
 * 
 * Rules:
 * - Any FAILED observation → node is FAILED
 * - Multiple DEGRADED → node is DEGRADED
 * - All HEALTHY → node is HEALTHY
 * - Missing critical observations → UNKNOWN
 * - Only stale observations → UNKNOWN
 */
export function determineNodeState(
  nodeId: string,
  observations: TwinObservation[],
  criticalMetrics: TwinObservationMetric[] = ['connectivity', 'video_stream', 'recording_active'],
  at: Date = new Date()
): NodeStateFromObservations {
  const issues: string[] = [];
  const staleMetrics: TwinObservationMetric[] = [];
  const conflicts: string[] = [];
  
  // Group by metric
  const observationsByMetric = new Map<TwinObservationMetric, TwinObservation[]>();
  for (const obs of observations) {
    const existing = observationsByMetric.get(obs.metric) ?? [];
    observationsByMetric.set(obs.metric, [...existing, obs]);
  }
  
  // Correlate each metric
  const metricStates: Array<{
    metric: TwinObservationMetric;
    state: TwinObservationState;
    source: TwinObservationSource;
    observedAt: Date;
    fresh: boolean;
  }> = [];
  
  let failedCount = 0;
  let degradedCount = 0;
  let healthyCount = 0;
  let unknownCount = 0;
  let totalConfidence = 0;
  
  for (const [metric, metricObservations] of observationsByMetric.entries()) {
    const correlation = correlateObservations(nodeId, metric, metricObservations, at);
    
    const effectiveState = correlation.hasFreshObservations
      ? correlation.consensusState
      : 'UNKNOWN';
    
    metricStates.push({
      metric,
      state: effectiveState,
      source: correlation.latest?.source ?? 'UNKNOWN' as TwinObservationSource,
      observedAt: correlation.latest?.observedAt ?? new Date(),
      fresh: correlation.hasFreshObservations
    });
    
    // Count states
    switch (effectiveState) {
      case 'FAILED':
        failedCount++;
        issues.push(`${metric}: FAILED`);
        break;
      case 'DEGRADED':
        degradedCount++;
        issues.push(`${metric}: DEGRADED`);
        break;
      case 'HEALTHY':
        healthyCount++;
        break;
      case 'UNKNOWN':
        unknownCount++;
        if (!correlation.hasFreshObservations) {
          staleMetrics.push(metric);
        }
        break;
    }
    
    // Track conflicts
    if (correlation.hasConflicts) {
      conflicts.push(`${metric}: ${correlation.conflictDetails?.join(', ')}`);
    }
    
    totalConfidence += correlation.consensusConfidence;
  }
  
  // Check for missing critical metrics
  for (const criticalMetric of criticalMetrics) {
    if (!observationsByMetric.has(criticalMetric)) {
      issues.push(`Missing critical metric: ${criticalMetric}`);
      unknownCount++;
    }
  }
  
  // Determine overall state
  let operationalState: TwinObservationState;
  
  if (failedCount > 0) {
    operationalState = 'FAILED';
  } else if (degradedCount > 0) {
    operationalState = 'DEGRADED';
  } else if (healthyCount > 0 && unknownCount === 0) {
    operationalState = 'HEALTHY';
  } else if (healthyCount > 0 && unknownCount < criticalMetrics.length) {
    operationalState = 'DEGRADED'; // Some metrics unknown but not critical
  } else {
    operationalState = 'UNKNOWN';
  }
  
  const totalMetrics = observationsByMetric.size;
  const confidence = totalMetrics > 0 ? totalConfidence / totalMetrics : 0;
  
  return {
    nodeId,
    operationalState,
    determinedAt: at,
    confidence,
    observations: metricStates,
    issues,
    staleMetrics,
    conflicts
  };
}

/**
 * Observation quality assessment
 */
export interface ObservationQuality {
  trustworthy: boolean;
  qualityScore: number;
  freshness: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED';
  sourceReliability: 'HIGH' | 'MEDIUM' | 'LOW';
  reason?: string;
}

/**
 * Assess observation quality
 */
export function assessObservationQuality(
  observation: TwinObservation,
  at: Date = new Date()
): ObservationQuality {
  const age = getObservationAge(observation, at);
  const timeUntilExpiry = getTimeUntilExpiry(observation, at);
  const freshnessDuration = observation.expiresAt.getTime() - observation.observedAt.getTime();
  
  // Determine freshness
  let freshness: ObservationQuality['freshness'];
  if (timeUntilExpiry < 0) {
    freshness = 'EXPIRED';
  } else if (timeUntilExpiry < freshnessDuration * 0.2) {
    freshness = 'STALE';
  } else if (timeUntilExpiry < freshnessDuration * 0.5) {
    freshness = 'AGING';
  } else {
    freshness = 'FRESH';
  }
  
  // Assess source reliability
  let sourceReliability: ObservationQuality['sourceReliability'];
  switch (observation.source) {
    case 'ONVIF':
    case 'SNMP':
    case 'RTSP':
    case 'HTTP_API':
    case 'TPM_ATTESTATION':
      sourceReliability = 'HIGH';
      break;
    case 'EDGE_AGENT':
    case 'NVR_API':
    case 'RECORDING_VERIFIER':
    case 'SECURITY_COLLECTOR':
    case 'ANALYTICS_ENGINE':
      sourceReliability = 'MEDIUM';
      break;
    case 'PING':
    case 'SYNTHETIC':
    case 'MANUAL':
      sourceReliability = 'LOW';
      break;
    default:
      sourceReliability = 'LOW';
  }
  
  // Calculate quality score
  let baseScore = 100;
  
  // Penalize by freshness
  if (freshness === 'EXPIRED') baseScore -= 100;
  else if (freshness === 'STALE') baseScore -= 40;
  else if (freshness === 'AGING') baseScore -= 20;
  
  // Penalize by source reliability
  if (sourceReliability === 'LOW') baseScore -= 20;
  else if (sourceReliability === 'MEDIUM') baseScore -= 10;
  
  // Adjust by confidence
  const qualityScore = Math.max(0, baseScore * observation.confidence);
  
  const trustworthy = qualityScore >= 70 && freshness !== 'EXPIRED';
  
  const reason = !trustworthy
    ? `${freshness} observation from ${sourceReliability} reliability source`
    : undefined;
  
  return {
    trustworthy,
    qualityScore,
    freshness,
    sourceReliability,
    reason
  };
}
