/**
 * Core type definitions for face recognition system
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  leftEye: Point;
  rightEye: Point;
  nose: Point;
  leftMouth: Point;
  rightMouth: Point;
}

export interface FaceDetection {
  boundingBox: BoundingBox;
  landmarks: FaceLandmarks;
  confidence: number;
  trackId?: string;
}

export interface FaceQualityResult {
  acceptable: boolean;
  score: number;
  reasons: FaceQualityRejectionReason[];
  metrics: {
    size: number;
    blur?: number;
    brightness?: number;
    yaw?: number;
    pitch?: number;
    roll?: number;
  };
}

export type FaceQualityRejectionReason =
  | 'TOO_SMALL'
  | 'TOO_BLURRY'
  | 'OVEREXPOSED'
  | 'UNDEREXPOSED'
  | 'POSE_TOO_EXTREME'
  | 'FACE_OCCLUDED'
  | 'LOW_DETECTION_CONFIDENCE'
  | 'LANDMARKS_MISSING'
  | 'OUT_OF_BOUNDS';

export interface AlignedFace {
  imageData: Float32Array;
  width: number;
  height: number;
  channels: number;
  landmarks: FaceLandmarks;
  quality: FaceQualityResult;
}

export interface FaceEmbedding {
  vector: Float32Array;
  modelName: string;
  modelVersion: string;
  quality: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
}

export interface FaceSearchCandidate {
  embeddingId: string;
  personId: string;
  displayName: string;
  watchlistId: string;
  watchlistName: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface PersonCandidate {
  personId: string;
  displayName: string;
  watchlistId: string;
  watchlistName: string;
  bestSimilarity: number;
  meanTopKSimilarity: number;
  supportingEmbeddings: number;
  embeddingMatches: Array<{
    embeddingId: string;
    similarity: number;
  }>;
}

export type RecognitionDecision =
  | {
      status: 'MATCH';
      personId: string;
      displayName: string;
      watchlistId: string;
      similarity: number;
      margin: number;
      confidence: number;
    }
  | {
      status: 'POSSIBLE_MATCH';
      candidates: PersonCandidate[];
      topSimilarity: number;
      margin: number;
    }
  | {
      status: 'UNKNOWN';
      topSimilarity?: number;
    }
  | {
      status: 'FACE_TOO_LOW_QUALITY';
      qualityScore: number;
      reasons: FaceQualityRejectionReason[];
    }
  | {
      status: 'MODEL_UNAVAILABLE';
      error: string;
    }
  | {
      status: 'SEARCH_UNAVAILABLE';
      error: string;
    };

export interface FaceObservation {
  faceId: string;
  frameId: string;
  cameraId: string;
  timestamp: Date;
  
  bbox: BoundingBox;
  landmarks: FaceLandmarks;
  detectionConfidence: number;
  
  quality: FaceQualityResult;
  embedding?: FaceEmbedding;
  recognition?: RecognitionDecision;
  
  trackId?: string;
}

export interface FaceTrackEvidence {
  trackId: string;
  cameraId: string;
  
  observations: FaceObservation[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  
  identityEvidence: Map<string, {
    personId: string;
    displayName: string;
    watchlistId: string;
    observations: number;
    bestSimilarity: number;
    meanSimilarity: number;
    maxQuality: number;
    meanQuality: number;
  }>;
  
  dominantIdentity?: {
    personId: string;
    displayName: string;
    watchlistId: string;
    confidence: number;
  };
}

export interface WatchlistThresholdConfig {
  matchThreshold: number;
  reviewThreshold: number;
  minimumMargin: number;
  minimumQuality: number;
  temporalConfirmationFrames: number;
  temporalWindowSeconds: number;
}

export interface FaceMatchEvent {
  eventId: string;
  tenantId: string;
  cameraId: string;
  branchId?: string;
  
  personId: string;
  personName: string;
  watchlistId: string;
  watchlistName: string;
  
  similarity: number;
  confidence: number;
  margin: number;
  qualityScore: number;
  
  bbox: BoundingBox;
  timestamp: Date;
  
  trackId?: string;
  trackObservations?: number;
  
  modelName: string;
  modelVersion: string;
  threshold: number;
  
  snapshotReference?: string;
  cropReference?: string;
}

export interface EnrollmentImageResult {
  success: boolean;
  embeddingId?: string;
  quality?: number;
  error?: string;
  reason?: FaceQualityRejectionReason[];
}

export interface EnrollmentResult {
  personId: string;
  acceptedImages: number;
  rejectedImages: number;
  embeddings: Array<{
    id: string;
    quality: number;
  }>;
  failures: Array<{
    imageIndex: number;
    reason: string;
    details?: FaceQualityRejectionReason[];
  }>;
}

export interface FaceRecognitionConfig {
  modelName: string;
  modelVersion: string;
  embeddingDimension: number;
  
  enrollmentQualityThreshold: number;
  runtimeQualityThreshold: number;
  
  minimumFaceSize: number;
  maximumPoseYaw: number;
  maximumPosePitch: number;
  maximumPoseRoll: number;
  
  searchLimit: number;
  retainEnrollmentImages: boolean;
}
