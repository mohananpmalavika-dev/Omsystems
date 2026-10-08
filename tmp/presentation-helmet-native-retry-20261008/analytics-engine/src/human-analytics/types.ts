/**
 * Type definitions for human analytics
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Vector2D {
  dx: number;
  dy: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PoseKeypoint {
  x: number;
  y: number;
  confidence: number;
}

export interface PoseKeypoints {
  nose: PoseKeypoint;
  leftEye: PoseKeypoint;
  rightEye: PoseKeypoint;
  leftEar: PoseKeypoint;
  rightEar: PoseKeypoint;
  leftShoulder: PoseKeypoint;
  rightShoulder: PoseKeypoint;
  leftElbow: PoseKeypoint;
  rightElbow: PoseKeypoint;
  leftWrist: PoseKeypoint;
  rightWrist: PoseKeypoint;
  leftHip: PoseKeypoint;
  rightHip: PoseKeypoint;
  leftKnee: PoseKeypoint;
  rightKnee: PoseKeypoint;
  leftAnkle: PoseKeypoint;
  rightAnkle: PoseKeypoint;
}

/**
 * Frame-level person observation
 */
export interface PersonObservation {
  tenantId: string;
  cameraId: string;
  frameId: string;
  timestamp: Date;

  localTrackId: string;
  boundingBox: BoundingBox;
  detectionConfidence: number;

  worldPosition?: Point2D;
  footPoint: Point2D;

  keypoints?: PoseKeypoints;
  poseConfidence?: number;

  appearanceEmbedding?: Float32Array;
  embeddingQuality?: number;
}

/**
 * Track state for a person within one camera session
 */
export interface PersonTrack {
  trackId: string;
  cameraId: string;
  tenantId: string;
  startedAt: Date;
  lastSeenAt: Date;

  observations: PersonObservation[];
  currentZoneIds: string[];

  stableEmbedding?: Float32Array;
  velocity?: Vector2D;
  status: "tentative" | "confirmed" | "lost" | "completed";

  // Derived metrics
  dwellTimeSeconds: number;
  isStationary: boolean;
  speed?: number; // meters per second or normalized units
  currentActivity?: "walking" | "running" | "sitting" | "standing" | "loitering" | "crawling";
}

/**
 * Camera appearance record for cross-camera journey reconstruction
 */
export interface CameraAppearance {
  id: string;
  tenantId: string;
  cameraId: string;
  localTrackId: string;

  enteredAt: Date;
  exitedAt: Date;

  entryGateId?: string;
  exitGateId?: string;

  representativeEmbedding?: number[];
  embeddingQuality: number;

  clothingFeatures?: ClothingFeatures;
  trajectorySummary?: TrajectorySummary;

  bestFrameId?: string;
}

export interface ClothingFeatures {
  dominantColors?: string[];
  upperBodyColor?: string;
  lowerBodyColor?: string;
  hasBackpack?: boolean;
  hasHat?: boolean;
}

export interface TrajectorySummary {
  entryDirection?: number; // angle in degrees
  exitDirection?: number;
  averageSpeed?: number;
  dwellTime: number;
}

/**
 * Cross-camera journey
 */
export interface PersonJourney {
  id: string;
  tenantId: string;

  startedAt: Date;
  lastUpdatedAt: Date;

  appearances: JourneyAppearanceLink[];

  confidence: number;
  status: "active" | "completed" | "ambiguous";
  reviewStatus?: "unreviewed" | "confirmed" | "rejected";
}

export interface JourneyAppearanceLink {
  appearanceId: string;
  cameraId: string;
  enteredAt: Date;
  exitedAt: Date;

  previousAppearanceId?: string;
  transitionConfidence?: number;
  transitionReasons?: string[];
}

/**
 * Camera topology for journey reconstruction
 */
export interface CameraTransition {
  fromCameraId: string;
  toCameraId: string;

  minimumTravelSeconds: number;
  maximumTravelSeconds: number;
  probability: number;

  fromGateId?: string;
  toGateId?: string;
}

/**
 * Counting gate configuration
 */
export interface CountingGate {
  id: string;
  cameraId: string;
  tenantId: string;
  name: string;

  lineStart: Point2D;
  lineEnd: Point2D;

  entrySide: "positive" | "negative";
  allowedDirection: "both" | "entry" | "exit";

  minimumTrackAgeMs: number;
  cooldownMs: number;
}

/**
 * Line crossing event
 */
export interface CrossingEvent {
  id: string;
  tenantId: string;
  cameraId: string;
  gateId: string;
  localTrackId: string;

  direction: "entry" | "exit";
  crossedAt: Date;
  confidence: number;

  beforePoint: Point2D;
  afterPoint: Point2D;

  metadata?: Record<string, unknown>;
}

/**
 * Occupancy ledger entry
 */
export interface OccupancyLedgerEntry {
  id: string;
  siteId: string;
  zoneId: string;
  timestamp: Date;
  delta: number;
  reason:
    | "camera_entry"
    | "camera_exit"
    | "manual_correction"
    | "access_control"
    | "reconciliation";
  sourceEventId: string;
  confidence: number;
}

/**
 * Fighting detection evidence
 */
export interface FightEvidence {
  id: string;
  tenantId: string;
  cameraId: string;
  participantTrackIds: string[];
  startedAt: Date;
  endedAt?: Date;

  candidateScore: number;
  classifierScore?: number;
  finalConfidence: number;

  evidenceFrameIds: string[];
  evidenceClipId?: string;

  modelVersion: string;
  available: true;

  status: "candidate" | "confirmed" | "uncertain" | "rejected";
}

/**
 * Pair interaction features for fighting detection
 */
export interface PairFeatures {
  normalizedDistance: number;
  relativeVelocity: number;
  approachSpeed: number;
  wristAccelerationA: number;
  wristAccelerationB: number;
  torsoMotionA: number;
  torsoMotionB: number;
  poseInstability: number;
  overlapRatio: number;
}

/**
 * Crowd window features for panic detection
 */
export interface CrowdWindowFeatures {
  activeTrackCount: number;
  densityPerSquareMeter?: number;

  meanSpeed: number;
  speedAcceleration: number;

  directionEntropy: number;
  velocityVariance: number;
  opticalFlowMagnitude: number;

  dispersionRate: number;
  fallCount: number;
  exitConvergence: number;
}

/**
 * Crowd baseline statistics
 */
export interface CrowdBaseline {
  cameraId: string;
  zoneId?: string;
  dayOfWeek: number;
  hourOfDay: number;

  medianSpeed: number;
  medianDensity: number;
  medianDirectionEntropy: number;

  madSpeed: number; // Median Absolute Deviation
  madDensity: number;
  madDirectionEntropy: number;

  sampleCount: number;
  lastUpdated: Date;
}

/**
 * Behavior event
 */
export interface BehaviorEvent {
  id: string;
  tenantId: string;
  cameraId: string;

  type:
    | "fight_suspected"
    | "fight_confirmed"
    | "unusual_crowd_motion"
    | "crowd_panic_suspected"
    | "line_crossing"
    | "journey_transition"
    | "loitering"
    | "running"
    | "fall"
    | "hands_raised";

  startedAt: Date;
  endedAt?: Date;

  confidence: number;
  severity: "low" | "medium" | "high" | "critical";

  trackIds: string[];

  evidence: {
    frameIds?: string[];
    clipId?: string;
    featureSummary?: Record<string, number>;
  };

  provenance: {
    detectorVersion: string;
    modelVersions: Record<string, string>;
    configurationVersion: string;
  };

  review: {
    status: "unreviewed" | "confirmed" | "rejected";
    reviewedBy?: string;
    reviewedAt?: Date;
    notes?: string;
  };
}

/**
 * Journey match features
 */
export interface JourneyMatchFeatures {
  appearanceSimilarity: number;
  topologyProbability: number;
  travelTimeLikelihood: number;
  gateCompatibility: number;
  clothingSimilarity: number;
  directionCompatibility: number;
}

/**
 * Gate track state for crossing deduplication
 */
export interface GateTrackState {
  gateId: string;
  trackId: string;
  stableSide: number;
  lastCrossedAt?: Date;
  countedDirections: Array<"entry" | "exit">;
}
