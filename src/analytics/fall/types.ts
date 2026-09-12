/**
 * Worker/Elderly Fall Detection Types & Contracts
 * 
 * Defines biometric pose structures, bounding box kinematics,
 * detector configurations, and persistent incident contracts.
 */

export interface Keypoint {
  x: number;
  y: number;
  confidence: number;
  z?: number;
}

export interface PoseKeypoints {
  nose?: Keypoint;
  leftEye?: Keypoint;
  rightEye?: Keypoint;
  leftEar?: Keypoint;
  rightEar?: Keypoint;
  leftShoulder?: Keypoint;
  rightShoulder?: Keypoint;
  leftElbow?: Keypoint;
  rightElbow?: Keypoint;
  leftWrist?: Keypoint;
  rightWrist?: Keypoint;
  leftHip?: Keypoint;
  rightHip?: Keypoint;
  leftKnee?: Keypoint;
  rightKnee?: Keypoint;
  leftAnkle?: Keypoint;
  rightAnkle?: Keypoint;
  spine?: Keypoint;
  pelvis?: Keypoint;
  [key: string]: Keypoint | undefined;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrackObservation {
  timestamp: number; // epoch ms
  boundingBox: BoundingBox;
  keypoints?: PoseKeypoints;
}

export interface PersonTrack {
  trackId: string;
  category?: 'worker' | 'elderly' | 'general';
  observations: TrackObservation[];
}

export type FallType =
  | 'forward'
  | 'backward'
  | 'sideways'
  | 'slump'
  | 'scaffold_drop'
  | 'unknown';

export type PersonCategory = 'worker' | 'elderly' | 'general';

export interface FallDetectorConfig {
  profile: PersonCategory;
  sensitivity: number; // 0.1 to 1.0 (default 0.75)
  minConfidence: number; // 0.1 to 1.0 (default 0.65)
  aspectRatioThreshold: number; // width/height > threshold indicates recumbent (default 1.20)
  velocityThreshold: number; // rapid downward descent velocity (default 0.15 px/ms or normalized/sec)
  torsoAngleThreshold: number; // degrees with floor: < 35 deg indicates horizontal/fallen
  motionlessDelaySeconds: number; // seconds post-fall with near-zero motion to trigger alert (default 3.0s)
  recoveryTimeoutSeconds: number; // max seconds to check for recovery before confirming emergency (default 15.0s)
  alertSeverity: 'P1' | 'P2' | 'P3';
}

export interface FallDetectionInput {
  cameraId: string;
  tenantId: string;
  timestamp: number;
  activeTracks: PersonTrack[];
  frameWidth?: number;
  frameHeight?: number;
}

export interface FallKinematicMetrics {
  currentAspectRatio: number;
  peakAspectRatio: number;
  aspectRatioVelocity: number; // d(AR)/dt
  verticalVelocity: number; // downward speed (positive downwards)
  verticalAcceleration: number; // downward acceleration / impact deceleration
  torsoAngleDegrees: number | null; // angle with horizontal (90 = upright, 0 = prone)
  headToHipDistance: number | null;
  floorProximityScore: number; // 0 to 1 (1 = resting at lowest floor plane)
  motionEnergy: number; // post-impact jitter / stillness
}

export interface FallDetectionResult {
  detected: boolean;
  trackId: string;
  personCategory: PersonCategory;
  fallType: FallType;
  confidence: number;
  severity: 'P1' | 'P2' | 'P3';
  status: 'confirmed' | 'suspected' | 'recovered' | 'none';
  impactSpeed: number;
  peakAspectRatio: number;
  torsoAngleDegrees: number | null;
  motionlessDurationSeconds: number;
  recoveryDetected: boolean;
  recoveryTimeSeconds: number | null;
  boundingBox: BoundingBox;
  poseKeypoints?: PoseKeypoints;
  dynamicsTelemetry: {
    kinematics: FallKinematicMetrics;
    stateHistory: string[];
    isIntentionalSuppressed: boolean;
    suppressionReason?: string;
  };
  alertRequired: boolean;
}

export interface FallEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  track_id: string;
  person_category: PersonCategory;
  fall_type: FallType;
  confidence: number;
  severity: 'P1' | 'P2' | 'P3';
  impact_speed: number;
  aspect_ratio_peak: number;
  torso_angle_degrees: number | null;
  motionless_duration_seconds: number;
  recovery_detected: boolean;
  recovery_time_seconds: number | null;
  bounding_box: BoundingBox;
  pose_keypoints: PoseKeypoints;
  dynamics_telemetry: Record<string, any>;
  snapshot_reference?: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
  occurred_at: Date;
  created_at: Date;
}

export interface FallCameraConfigRecord {
  camera_id: string;
  tenant_id: string;
  enabled: boolean;
  profile: PersonCategory;
  sensitivity: number;
  min_confidence: number;
  aspect_ratio_threshold: number;
  velocity_threshold: number;
  torso_angle_threshold: number;
  motionless_delay_seconds: number;
  recovery_timeout_seconds: number;
  alert_severity: 'P1' | 'P2' | 'P3';
  created_at: Date;
  updated_at: Date;
}

export interface ListFallEventsFilter {
  tenantId: string;
  cameraId?: string;
  personCategory?: PersonCategory;
  severity?: 'P1' | 'P2' | 'P3';
  reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface FallStats {
  totalFalls: number;
  workerFalls: number;
  elderlyFalls: number;
  unrecoveredEmergencyCount: number;
  recoveredCount: number;
  pendingReviewCount: number;
  falsePositiveCount: number;
  avgConfidence: number;
  p1Count: number;
}
