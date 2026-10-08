/**
 * Cross-Camera Journey Types
 * 
 * Defines the core data structures for persistent person tracking across cameras.
 * This subsystem transforms local camera tracks into a global journey graph.
 */

/**
 * Association method used to link an observation to a global person
 */
export type AssociationMethod = 
  | 'LOCAL_TRACK'      // Same camera continuation
  | 'REID'             // ReID embedding match
  | 'TOPOLOGY_REID'    // Combined topology + ReID
  | 'MANUAL'           // Operator override
  | 'UNKNOWN';         // Unresolved

/**
 * Confidence level for a transition between observations
 */
export type TransitionStatus =
  | 'CONFIRMED'   // High confidence (>= 0.92)
  | 'PROBABLE'    // Good confidence (>= 0.80)
  | 'AMBIGUOUS'   // Uncertain (>= 0.65)
  | 'REJECTED';   // Below threshold

/**
 * Global person status
 */
export type GlobalPersonStatus =
  | 'ACTIVE'      // Currently being tracked
  | 'MERGED'      // Merged into another identity
  | 'SPLIT'       // Split from incorrect merge
  | 'ARCHIVED';   // No longer active

/**
 * Journey session status
 */
export type JourneySessionStatus =
  | 'ACTIVE'      // Currently in progress
  | 'COMPLETED'   // Naturally ended
  | 'TIMED_OUT';  // Ended due to inactivity

/**
 * Embedding quality metrics
 */
export interface EmbeddingQuality {
  resolution: number;    // Crop size quality (0-1)
  occlusion: number;     // Visibility (0-1, 1 = fully visible)
  blur: number;          // Sharpness (0-1, 1 = sharp)
  visibility: number;    // Overall visibility (0-1)
  pose: number;          // Body pose quality (0-1)
  lighting: number;      // Lighting conditions (0-1)
}

/**
 * ReID sample from a single frame
 */
export interface ReIdSample {
  embedding: Float32Array;
  confidence: number;
  quality: EmbeddingQuality;
  frameId?: string;
  timestamp: Date;
  boundingBox?: BoundingBox;
}

/**
 * Bounding box coordinates
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Global person entity - represents a unique individual across cameras
 */
export interface GlobalPerson {
  id: string;
  tenantId: string;
  branchId?: string;
  
  knownIdentityId?: string;  // Link to watchlist/employee if identified
  
  firstSeenAt: Date;
  lastSeenAt: Date;
  
  confidence: number;  // Overall identity confidence
  
  status: GlobalPersonStatus;
  mergedIntoId?: string;  // If merged, points to target identity
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Person observation - a track on one camera
 */
export interface PersonObservation {
  id: string;
  
  tenantId: string;
  branchId: string;
  
  globalPersonId: string | null;  // Null until identity resolved
  
  cameraId: string;
  trackId: string;  // Local tracker ID
  
  enteredAt: Date;
  exitedAt: Date;
  
  representativeEmbeddingId?: string;  // Links to reid_embedding table
  
  detectionConfidence: number;  // Detector confidence
  embeddingQuality?: number;    // Quality of representative embedding
  identityConfidence?: number;  // Confidence in global identity assignment
  
  entryZoneId?: string;   // Zone where person entered frame
  exitZoneId?: string;    // Zone where person exited frame
  
  firstFrameId?: string;
  lastFrameId?: string;
  
  thumbnailUri?: string;  // Path to representative image
  
  associationMethod: AssociationMethod;
  modelVersion?: string;
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
}

/**
 * Transition between two observations
 */
export interface PersonTransition {
  id: string;
  
  tenantId: string;
  branchId: string;
  
  globalPersonId: string;
  
  fromObservationId: string;
  toObservationId: string;
  
  fromCameraId: string;
  toCameraId: string;
  
  departedAt: Date;
  arrivedAt: Date;
  
  travelTimeMs: number;
  
  // Confidence components
  reidSimilarity?: number;      // Embedding similarity (0-1)
  topologyScore?: number;       // Topology feasibility (0-1)
  temporalScore?: number;       // Time feasibility (0-1)
  zoneScore?: number;           // Entry/exit zone match (0-1)
  
  transitionConfidence: number; // Combined confidence (0-1)
  
  status: TransitionStatus;
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
}

/**
 * Camera transition rule (topology)
 */
export interface CameraTransitionRule {
  id: string;
  
  tenantId: string;
  branchId: string;
  
  fromCameraId: string;
  toCameraId: string;
  
  fromZoneId?: string;
  toZoneId?: string;
  
  minTravelSeconds: number;
  typicalTravelSeconds?: number;
  maxTravelSeconds: number;
  
  probability?: number;  // Historical probability (0-1)
  
  bidirectional: boolean;
  enabled: boolean;
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Journey session - groups observations into a single visit
 */
export interface PersonJourneySession {
  id: string;
  
  tenantId: string;
  globalPersonId: string;
  
  branchId?: string;
  
  startedAt: Date;
  endedAt?: Date;
  
  status: JourneySessionStatus;
  
  observationCount: number;
  transitionCount: number;
  
  overallConfidence: number;
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Identity association record (for audit trail and splits)
 */
export interface IdentityAssociation {
  id: string;
  
  observationId: string;
  globalPersonId: string;
  
  confidence: number;
  
  createdBy: 'REID' | 'TOPOLOGY' | 'MANUAL' | 'SYSTEM';
  createdByUserId?: string;
  
  validFrom: Date;
  revokedAt?: Date;
  
  reason?: string;
  
  metadata?: Record<string, any>;
  
  createdAt: Date;
}

/**
 * Journey appearance (enriched observation for API)
 */
export interface JourneyAppearance {
  observationId: string;
  
  cameraId: string;
  cameraName: string;
  
  branchId: string;
  
  enteredAt: Date;
  exitedAt: Date;
  
  durationMs: number;
  
  trackId: string;
  
  thumbnailUri?: string;
  
  entryZoneId?: string;
  exitZoneId?: string;
  
  identityConfidence: number;
  
  metadata?: Record<string, any>;
}

/**
 * Journey transition (enriched for API)
 */
export interface JourneyTransition {
  transitionId: string;
  
  fromObservationId: string;
  toObservationId: string;
  
  fromCameraId: string;
  fromCameraName: string;
  toCameraId: string;
  toCameraName: string;
  
  departedAt: Date;
  arrivedAt: Date;
  
  travelTimeMs: number;
  
  confidence: number;
  status: TransitionStatus;
  
  metadata?: Record<string, any>;
}

/**
 * Unresolved gap in journey
 */
export interface JourneyGap {
  type: 'UNRESOLVED_GAP';
  
  afterObservationId: string;
  beforeObservationId: string;
  
  afterCameraId: string;
  beforeCameraId: string;
  
  gapStartedAt: Date;
  gapEndedAt: Date;
  
  durationMs: number;
  
  confidence: number;  // Confidence that it's the same person
  
  possiblePaths?: Array<{
    cameras: string[];
    confidence: number;
  }>;
}

/**
 * Complete person journey
 */
export interface PersonJourney {
  globalPersonId: string;
  
  startedAt: Date | null;
  endedAt: Date | null;
  
  totalDurationMs: number;
  
  cameraCount: number;
  branchCount: number;
  
  appearances: JourneyAppearance[];
  transitions: JourneyTransition[];
  
  unresolvedGaps: JourneyGap[];
  
  overallConfidence: number;
  
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  statusReason?: string;
  
  metadata?: Record<string, any>;
}

/**
 * Journey query options
 */
export interface JourneyQueryOptions {
  from?: Date;
  to?: Date;
  branchId?: string;
  minConfidence?: number;
  includeGaps?: boolean;
}

/**
 * Person search result
 */
export interface PersonSearchMatch {
  globalPersonId: string;
  similarity: number;
  appearances: number;
  lastSeenAt: Date;
  cameras: string[];
  branches: string[];
}

/**
 * Person search request
 */
export interface PersonSearchRequest {
  tenantId: string;
  branchId?: string;
  embedding?: number[];
  imageData?: Buffer;
  fromTime?: Date;
  toTime?: Date;
  minSimilarity?: number;
  maxResults?: number;
}

/**
 * Identity resolution result
 */
export interface IdentityResolution {
  globalPersonId: string;
  isNewIdentity: boolean;
  confidence: number;
  matchedObservationId?: string;
  method: AssociationMethod;
}

/**
 * Candidate observation for identity matching
 */
export interface CandidateObservation {
  observationId: string;
  globalPersonId: string;
  cameraId: string;
  exitedAt: Date;
  embeddingId: string;
  reidScore: number;
  temporalScore: number;
  topologyScore: number;
  qualityScore: number;
  totalScore: number;
}

/**
 * New observation creation request
 */
export interface NewPersonObservation {
  tenantId: string;
  branchId: string;
  cameraId: string;
  trackId: string;
  enteredAt: Date;
  exitedAt: Date;
  embedding: Float32Array;
  embeddingQuality: number;
  detectionConfidence: number;
  entryZoneId?: string;
  exitZoneId?: string;
  thumbnailUri?: string;
  metadata?: Record<string, any>;
}

/**
 * Track embedding accumulator state
 */
export interface TrackEmbeddingState {
  samples: ReIdSample[];
  representativeEmbedding: Float32Array | null;
  averageQuality: number;
}

/**
 * Topology scoring parameters
 */
export interface TopologyScoreParams {
  fromCameraId: string;
  toCameraId: string;
  fromExitZone?: string;
  toEntryZone?: string;
  travelTimeMs: number;
}

/**
 * Temporal feasibility check result
 */
export interface TemporalFeasibility {
  feasible: boolean;
  score: number;  // 0-1
  reason?: string;
}

/**
 * Journey statistics
 */
export interface JourneyStatistics {
  totalJourneys: number;
  activeJourneys: number;
  completedJourneys: number;
  averageDurationMs: number;
  averageCamerasVisited: number;
  totalObservations: number;
  totalTransitions: number;
}

/**
 * Transition analytics
 */
export interface TransitionAnalytics {
  fromCameraId: string;
  toCameraId: string;
  count: number;
  averageTravelTimeMs: number;
  medianTravelTimeMs: number;
  p95TravelTimeMs: number;
  averageConfidence: number;
}
